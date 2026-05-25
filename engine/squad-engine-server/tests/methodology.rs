//! Integration tests for `/v1/workspaces/:wid/methodology` + auto-seed on project bind.

use squad_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, tempfile::TempDir) {
    let token = "metest".to_string();
    let docs = tempfile::TempDir::new().unwrap();
    let home = tempfile::TempDir::new().unwrap();
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: home.path().to_path_buf(),
        docs_dir: docs.path().to_path_buf(),
        app_system_prompt: String::new(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
    let app = build_router(state);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    std::mem::forget(home);
    (addr, token, docs)
}

async fn create_workspace(addr: SocketAddr, tok: &str) -> String {
    let c = reqwest::Client::new();
    let ws: serde_json::Value = c
        .post(format!("http://{addr}/v1/workspaces"))
        .bearer_auth(tok)
        .json(&serde_json::json!({ "name": "alpha" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    ws["id"].as_str().unwrap().to_string()
}

fn make_repo(parent: &std::path::Path, name: &str) -> PathBuf {
    let repo = parent.join(name);
    std::fs::create_dir_all(&repo).unwrap();
    repo
}

async fn bind_project(addr: SocketAddr, tok: &str, wid: &str, repo: &std::path::Path) -> String {
    let c = reqwest::Client::new();
    let name = repo
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("test-repo")
        .to_string();
    let p: serde_json::Value = c
        .post(format!("http://{addr}/v1/workspaces/{wid}/projects"))
        .bearer_auth(tok)
        .json(&serde_json::json!({
            "name": name,
            "repoPath": repo.to_string_lossy(),
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    p["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn default_methodology_config_is_disabled() {
    let (addr, tok, _docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let c = reqwest::Client::new();

    let cfg: serde_json::Value = c
        .get(format!("http://{addr}/v1/workspaces/{wid}/methodology"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(cfg["enabled"], false);
    assert_eq!(cfg["triggerMode"], "pre-merge");
    assert!(cfg.get("targetBranch").map(|v| v.is_null()).unwrap_or(true));
}

#[tokio::test]
async fn put_methodology_persists_and_emits_event() {
    let (addr, tok, _docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let c = reqwest::Client::new();

    let body = serde_json::json!({
        "enabled": true,
        "triggerMode": "pre-commit",
        "targetBranch": "staging"
    });
    let resp = c
        .put(format!("http://{addr}/v1/workspaces/{wid}/methodology"))
        .bearer_auth(&tok)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_success());

    let cfg: serde_json::Value = c
        .get(format!("http://{addr}/v1/workspaces/{wid}/methodology"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(cfg["enabled"], true);
    assert_eq!(cfg["triggerMode"], "pre-commit");
    assert_eq!(cfg["targetBranch"], "staging");
}

#[tokio::test]
async fn bind_project_with_methodology_disabled_does_not_seed() {
    let (addr, tok, docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let repo = make_repo(docs.path(), "disabled-repo");

    bind_project(addr, &tok, &wid, &repo).await;

    assert!(
        !repo.join(".claude/method.config").exists(),
        "should NOT seed when methodology.enabled=false"
    );
}

#[tokio::test]
async fn bind_project_with_methodology_enabled_auto_seeds() {
    let (addr, tok, docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let c = reqwest::Client::new();

    c.put(format!("http://{addr}/v1/workspaces/{wid}/methodology"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "enabled": true,
            "triggerMode": "pre-merge"
        }))
        .send()
        .await
        .unwrap();

    let repo = make_repo(docs.path(), "enabled-repo");
    bind_project(addr, &tok, &wid, &repo).await;

    assert!(repo.join(".claude/method.config").exists());
    assert!(repo.join(".claude/rules.md").exists());
    assert!(repo.join(".claude/hooks/gate-merge.sh").exists());
    assert!(repo.join("claude-method.md").exists());
}

#[tokio::test]
async fn manual_seed_endpoint_seeds_a_project() {
    let (addr, tok, docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let repo = make_repo(docs.path(), "manual-repo");
    let pid = bind_project(addr, &tok, &wid, &repo).await;
    assert!(
        !repo.join(".claude/method.config").exists(),
        "auto-seed should not have run (methodology disabled)"
    );

    let c = reqwest::Client::new();
    let resp: serde_json::Value = c
        .post(format!(
            "http://{addr}/v1/workspaces/{wid}/projects/{pid}/methodology/seed"
        ))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(resp["filesCreated"].as_array().unwrap().len() >= 8);
    assert!(repo.join(".claude/method.config").exists());
}

#[tokio::test]
async fn manual_seed_with_force_overwrites_existing() {
    let (addr, tok, docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let repo = make_repo(docs.path(), "force-repo");
    let pid = bind_project(addr, &tok, &wid, &repo).await;

    let c = reqwest::Client::new();
    c.post(format!(
        "http://{addr}/v1/workspaces/{wid}/projects/{pid}/methodology/seed"
    ))
    .bearer_auth(&tok)
    .send()
    .await
    .unwrap();

    let rules = repo.join(".claude/rules.md");
    std::fs::write(&rules, "USER OVERRIDE\n").unwrap();

    c.post(format!(
        "http://{addr}/v1/workspaces/{wid}/projects/{pid}/methodology/seed?force=true"
    ))
    .bearer_auth(&tok)
    .send()
    .await
    .unwrap();

    let body = std::fs::read_to_string(&rules).unwrap();
    assert_ne!(body, "USER OVERRIDE\n");
}

#[tokio::test]
async fn status_endpoint_reports_per_project_seeded_state() {
    let (addr, tok, docs) = spawn().await;
    let wid = create_workspace(addr, &tok).await;
    let c = reqwest::Client::new();

    // Empty workspace → empty status array.
    let empty: serde_json::Value = c
        .get(format!("http://{addr}/v1/workspaces/{wid}/methodology/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(empty.as_array().unwrap().len(), 0);

    // Two projects: bind both, only seed one.
    let repo_seeded = make_repo(docs.path(), "status-seeded");
    let repo_bare = make_repo(docs.path(), "status-bare");
    let pid_seeded = bind_project(addr, &tok, &wid, &repo_seeded).await;
    let pid_bare = bind_project(addr, &tok, &wid, &repo_bare).await;

    c.post(format!(
        "http://{addr}/v1/workspaces/{wid}/projects/{pid_seeded}/methodology/seed"
    ))
    .bearer_auth(&tok)
    .send()
    .await
    .unwrap();

    let status: serde_json::Value = c
        .get(format!("http://{addr}/v1/workspaces/{wid}/methodology/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let arr = status.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    let seeded_entry = arr
        .iter()
        .find(|e| e["projectId"] == pid_seeded.as_str())
        .unwrap();
    assert_eq!(seeded_entry["seeded"], true);
    let bare_entry = arr
        .iter()
        .find(|e| e["projectId"] == pid_bare.as_str())
        .unwrap();
    assert_eq!(bare_entry["seeded"], false);
}
