import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, X } from "lucide-react";
import { Button, cn } from "@squad/core";
import { useUIStore } from "../../stores/ui";
import { useDetectedTeamManifest } from "../../hooks/use-detected-team-manifest";

const DISMISS_KEY = "squad.team-manifest-banner.dismissed";

/**
 * H.3 — persistent prompt to hire the team a repo ships with.
 *
 * Renders at the top of the workspace shell whenever a bound project
 * has a `<repo>/.squad/team/team.json` whose members aren't all
 * represented as agents in the current workspace. Clicking the CTA
 * opens RecruitTeamDialog (which reads the same manifest and
 * preselects the missing roles).
 *
 * Dismissal is per-session via sessionStorage so the banner doesn't
 * follow the user across launches if they close it on purpose.
 */
export function TeamManifestBanner() {
  const { t } = useTranslation("shell");
  const detected = useDetectedTeamManifest();
  const setRecruitOpen = useUIStore((s) => s.setRecruitTeamDialogOpen);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  if (!detected || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-3 px-4 py-2",
        "border-b border-border bg-accent/40 text-foreground",
      )}
    >
      <Users className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-sm flex-1 min-w-0">
        {t("teamManifestBanner.text", {
          count: detected.missing.length,
          repo: detected.project.name,
        })}
      </span>
      <Button
        size="sm"
        className="h-7 rounded-full text-xs"
        onClick={() => setRecruitOpen(true)}
      >
        {t("teamManifestBanner.action")}
      </Button>
      <button
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground"
        aria-label={t("teamManifestBanner.dismiss")}
        title={t("teamManifestBanner.dismiss")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
