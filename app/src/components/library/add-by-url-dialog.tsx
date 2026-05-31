import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Github } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@squad/core";
import type { LibraryKind } from "@squad/engine-client";
import { useInstallFromUrl } from "../../hooks/queries/use-library";
import { useUIStore } from "../../stores/ui";

interface Props {
  open: boolean;
  /** Kind hint for copy + invalidation. The engine auto-detects from repo
   * contents, so a `skill`-flavored dialog can still install a role/MCP if
   * the URL points at one — we surface that in the success toast. */
  kind: LibraryKind;
  onOpenChange: (open: boolean) => void;
  onInstalled?: (slug: string) => void;
}

export function AddByUrlDialog({ open, kind, onOpenChange, onInstalled }: Props) {
  const { t } = useTranslation("library");
  const [value, setValue] = useState("");
  const install = useInstallFromUrl(kind);
  const addToast = useUIStore((s) => s.addToast);
  const busy = install.isPending;

  const close = () => {
    setValue("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const url = value.trim();
    if (!url) return;
    try {
      const result = await install.mutateAsync(url);
      addToast({
        title: t("addByUrl.success", { name: result.item.name }),
        description: t(`addByUrl.detected.${result.kind}`),
        variant: "success",
      });
      onInstalled?.(result.slug);
      close();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast({
        title: t("addByUrl.error"),
        description: msg,
        variant: "error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addByUrl.title")}</DialogTitle>
          <DialogDescription>{t("addByUrl.body")}</DialogDescription>
        </DialogHeader>

        <div className="relative py-2">
          <Github className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("addByUrl.placeholder")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            autoFocus
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {t("addByUrl.unverifiedWarning")}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            {t("addByUrl.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={busy || value.trim() === ""}>
            {busy ? t("addByUrl.installing") : t("addByUrl.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
