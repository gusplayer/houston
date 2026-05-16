import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import { tauriStore } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useUIStore } from "../../stores/ui";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lets the user import a community agent by pasting a GitHub URL or
 * owner/repo path. Calls the same engine route the workspace import
 * uses, then refreshes the catalog so the new agent appears.
 */
export function ImportFromUrlDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("store");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const loadConfigs = useAgentCatalogStore((s) => s.loadConfigs);

  const close = () => {
    setValue("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await tauriStore.installFromGithub(trimmed);
      await loadConfigs();
      addToast({ title: t("import.success"), variant: "success" });
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        title: t("import.error"),
        description: msg,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.body")}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Input
            placeholder={t("import.placeholder")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {t("import.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={busy || value.trim() === ""}>
            {t("import.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
