//! Interactive PTY session — spawn `claude` in a pseudo-terminal so the user
//! sees the real terminal experience (colours, progress spinners, interactive
//! prompts) exactly as they would in Warp or iTerm.
//!
//! This is a **separate** session mode from the structured batch sessions
//! (`claude -p --output-format stream-json`). Here we run `claude` without
//! `-p`, giving the user a live REPL. The PTY ensures `isatty()` returns true
//! so the CLI renders ANSI escape codes properly.
//!
//! # Wire contract
//!
//! - `PtyEvent::Data(bytes)` — raw bytes from the PTY master (ansi-escaped
//!   terminal output); hand directly to an xterm.js instance over binary WS.
//! - `PtyEvent::Exit(code)` — process exited; close the WS.
//!
//! The caller sends commands to the PTY via `PtyHandle::write_bytes` and
//! `PtyHandle::resize`.

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::path::PathBuf;
use tokio::sync::mpsc;

/// Events produced by a running PTY session.
#[derive(Debug)]
pub enum PtyEvent {
    /// Raw bytes from the PTY master — pipe directly to xterm.js.
    Data(Vec<u8>),
    /// Process exited with the given code.
    Exit(i32),
}

/// Kill signal sent from the WS handler to the PTY controller thread.
struct PtyKill;

/// Handle to a running PTY session. Drop to abandon (does NOT kill child);
/// call `kill()` for explicit termination.
pub struct PtyHandle {
    /// Receive raw PTY output bytes here.
    pub data_rx: mpsc::Receiver<PtyEvent>,
    /// Send keystrokes (raw bytes) to the PTY stdin. Clone freely.
    pub write_tx: mpsc::Sender<Vec<u8>>,
    /// Send resize events `(cols, rows)`. Clone freely.
    pub resize_tx: mpsc::Sender<(u16, u16)>,
    cmd_tx: mpsc::Sender<PtyKill>,
}

impl PtyHandle {
    /// Send raw bytes (keystrokes) to the PTY stdin.
    pub async fn write_bytes(&self, data: Vec<u8>) -> bool {
        self.write_tx.send(data).await.is_ok()
    }

    /// Resize the PTY window.
    pub async fn resize(&self, cols: u16, rows: u16) -> bool {
        self.resize_tx.send((cols, rows)).await.is_ok()
    }

    /// Kill the subprocess and close the session.
    pub fn kill(self) {
        let _ = self.cmd_tx.blocking_send(PtyKill);
    }
}

/// Spawn an interactive `claude` session in a PTY.
///
/// `claude_bin` — absolute path to the `claude` CLI binary.
/// `working_dir` — agent project directory (becomes `claude`'s cwd).
/// `cols`/`rows` — initial terminal size.
pub fn spawn_pty(
    claude_bin: PathBuf,
    working_dir: Option<PathBuf>,
    cols: u16,
    rows: u16,
) -> Result<PtyHandle, String> {
    let pty_system = NativePtySystem::default();
    let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut cmd = CommandBuilder::new(&claude_bin);
    cmd.env("PATH", crate::claude_path::shell_path());
    // Interactive REPL mode — no -p flag, no --output-format.
    cmd.arg("--dangerously-skip-permissions");
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    if let Some(ref dir) = working_dir {
        cmd.cwd(dir);
    }

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to take PTY writer: {e}"))?;
    let master = pair.master;

    // Channels
    let (data_tx, data_rx) = mpsc::channel::<PtyEvent>(256);
    let (write_tx, mut write_rx) = mpsc::channel::<Vec<u8>>(64);
    let (resize_tx, resize_rx) = mpsc::channel::<(u16, u16)>(8);
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<PtyKill>(4);

    // --- Reader thread: PTY master output → data channel ---
    // Also auto-accepts the claude first-run directory trust prompt so the
    // user lands straight in the REPL without a manual keypress.
    //
    // Watches PTY output with a rolling 512-byte window so the prompt is
    // detected even when claude's TUI writes "Enter to confirm" across
    // multiple chunk boundaries (a single 4KB read is not enough — TUI
    // frames can arrive split). Sends `\r` (carriage return) — the
    // keycode for the Return key in raw mode. Sending `\n` (line feed)
    // does NOT work: claude's Ink-based TUI runs the PTY in raw mode
    // and only treats CR as Enter.
    let data_tx_r = data_tx.clone();
    let write_tx_auto = write_tx.clone();
    let mut reader = reader;
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut trust_accepted = false;
        // Rolling tail of recent bytes for cross-chunk pattern detection.
        // 512 bytes is enough — the trust prompt fits in that window.
        let mut tail: Vec<u8> = Vec::with_capacity(512);
        let needle = b"Enter to confirm";
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    // Detect the trust prompt across chunk boundaries.
                    if !trust_accepted {
                        tail.extend_from_slice(&buf[..n]);
                        if tail.len() > 512 {
                            let drop = tail.len() - 512;
                            tail.drain(0..drop);
                        }
                        if tail.windows(needle.len()).any(|w| w == needle) {
                            trust_accepted = true;
                            // Claude TUI is in raw mode — Enter key = \r
                            // (CR), not \n (LF).
                            let _ = write_tx_auto.blocking_send(b"\r".to_vec());
                            // Free the buffer; we don't need it anymore.
                            tail.clear();
                            tail.shrink_to_fit();
                        }
                    }
                    if data_tx_r
                        .blocking_send(PtyEvent::Data(buf[..n].to_vec()))
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
    });

    // --- Writer thread: write channel → PTY master stdin ---
    let mut writer = writer;
    std::thread::spawn(move || {
        while let Some(bytes) = write_rx.blocking_recv() {
            if writer.write_all(&bytes).is_err() {
                break;
            }
        }
    });

    // --- Controller thread: resize commands + wait for child exit ---
    let data_tx_c = data_tx;
    let mut resize_rx = resize_rx;
    std::thread::spawn(move || {
        loop {
            // Drain any pending resize events.
            loop {
                match resize_rx.try_recv() {
                    Ok((c, r)) => {
                        let _ = master.resize(PtySize {
                            rows: r,
                            cols: c,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    _ => break,
                }
            }
            // Check for kill command.
            if cmd_rx.try_recv().is_ok() {
                let _ = child.kill();
                break;
            }
            // Check if child exited.
            if let Ok(Some(status)) = child.try_wait() {
                let code = status.exit_code() as i32;
                let _ = data_tx_c.blocking_send(PtyEvent::Exit(code));
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        // Collect exit after kill.
        let code = child
            .wait()
            .map(|s| s.exit_code() as i32)
            .unwrap_or(-1);
        let _ = data_tx_c.blocking_send(PtyEvent::Exit(code));
    });

    Ok(PtyHandle { data_rx, write_tx, resize_tx, cmd_tx })
}

#[cfg(test)]
mod tests {
    /// Simulates the rolling-buffer detection used by the reader thread.
    /// The needle straddles two reads, which is the exact scenario that
    /// `text.contains()` on a single 4KB chunk failed to match.
    fn detect(chunks: &[&[u8]], needle: &[u8]) -> bool {
        let mut tail: Vec<u8> = Vec::with_capacity(512);
        for chunk in chunks {
            tail.extend_from_slice(chunk);
            if tail.len() > 512 {
                let drop = tail.len() - 512;
                tail.drain(0..drop);
            }
            if tail.windows(needle.len()).any(|w| w == needle) {
                return true;
            }
        }
        false
    }

    #[test]
    fn detects_needle_within_single_chunk() {
        let needle = b"Enter to confirm";
        assert!(detect(&[b"... press Enter to confirm choice ..."], needle));
    }

    #[test]
    fn detects_needle_split_across_two_chunks() {
        let needle = b"Enter to confirm";
        // Split right in the middle of the needle — the failure mode
        // a single-chunk `text.contains()` cannot catch.
        let first: &[u8] = b"prompt arrives Enter to ";
        let second: &[u8] = b"confirm and waits for keypress";
        assert!(detect(&[first, second], needle));
    }

    #[test]
    fn detects_needle_split_across_many_chunks() {
        let needle = b"Enter to confirm";
        // One byte per chunk — pathological, but the rolling tail must
        // still match.
        let prefix = b"junk ";
        let suffix = b" trailing";
        let mut chunks: Vec<Vec<u8>> = Vec::new();
        for &b in prefix {
            chunks.push(vec![b]);
        }
        for &b in needle {
            chunks.push(vec![b]);
        }
        for &b in suffix {
            chunks.push(vec![b]);
        }
        let refs: Vec<&[u8]> = chunks.iter().map(|v| v.as_slice()).collect();
        assert!(detect(&refs, needle));
    }

    #[test]
    fn does_not_detect_when_needle_absent() {
        let needle = b"Enter to confirm";
        assert!(!detect(&[b"some other prompt text"], needle));
    }

    #[test]
    fn tail_does_not_exceed_512_bytes() {
        // Sanity: pump more than 512 bytes through the rolling window and
        // confirm the buffer never grows unbounded (we don't expose the
        // buffer here, but we can assert detection still works for a
        // needle near the end of a long stream — proves the trim doesn't
        // chop the needle prematurely).
        let needle = b"Enter to confirm";
        let mut long_prefix = vec![b'x'; 4096];
        long_prefix.extend_from_slice(needle);
        assert!(detect(&[&long_prefix], needle));
    }
}
