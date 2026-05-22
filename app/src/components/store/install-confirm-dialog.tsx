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
} from "@squad/core";
import type { StoreListing } from "../../lib/types";
import { IntegrationLogos } from "../integration-logos";

interface Props {
  open: boolean;
  listing: StoreListing | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  installing?: boolean;
}

/**
 * Trust UI shown before installing a non-Squad agent. Lists which
 * integrations it will request, links to source on GitHub, and forces
 * the user to confirm.
 *
 * For mock community agents the parent should skip this dialog and show
 * the "Preview, not yet available" message in the detail view instead.
 */
export function InstallConfirmDialog({
  open,
  listing,
  onOpenChange,
  onConfirm,
  installing,
}: Props) {
  const { t } = useTranslation("store");
  if (!listing) return null;
  const publisher = listing.publisher?.name ?? listing.author;
  const github =
    listing.publisher?.github_url ?? `https://github.com/${listing.repo}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("trust.title", { name: listing.name })}</DialogTitle>
          <DialogDescription>
            {t("trust.body", { publisher })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {listing.integrations && listing.integrations.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("trust.integrationsNeeded")}
              </span>
              <IntegrationLogos toolkits={listing.integrations} small={false} />
            </div>
          )}
          <a
            href={github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Github className="size-4" />
            {t("trust.viewSource")}
          </a>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={installing}
          >
            {t("trust.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={installing}>
            {t("trust.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
