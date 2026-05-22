import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
  Spinner,
  AGENT_COLORS,
  cn,
} from "@squad/core";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useUIStore } from "../../stores/ui";
import { useProjects } from "../../hooks/queries";
import { recommendTeam, ROLE_IDS, type RoleId } from "../../lib/recommend-team";
import { readTeamManifest, type TeamMember } from "../../lib/team-manifest";
import { AgentAvatar } from "./agent-avatar";
import type { Project } from "@squad/engine-client";

/**
 * G.3 — the "magic moment" dialog. Shows the team library with
 * recommendation hints (G.2) and hires every selected role in one
 * pass. Each role keeps its built-in name (Maya, Diego, Peter, …),
 * gets a distinct color from AGENT_COLORS, and is created with its
 * built-in CLAUDE.md so it shows up with a voice already.
 */
export function RecruitTeamDialog() {
  const { t } = useTranslation("shell");
  const open = useUIStore((s) => s.recruitTeamDialogOpen);
  const setOpen = useUIStore((s) => s.setRecruitTeamDialogOpen);
  const agentDefs = useAgentCatalogStore((s) => s.agents);
  const workspace = useWorkspaceStore((s) => s.current);
  const create = useAgentStore((s) => s.create);
  const { data: projects } = useProjects(workspace?.id);

  const [selected, setSelected] = useState<Set<RoleId>>(new Set());
  const [recommended, setRecommended] = useState<Set<RoleId>>(new Set());
  // Roles + name/color overrides imported from a repo's `.squad/team.json`.
  // Takes precedence over the stack-detected recommendation: the team the
  // repo asked for is what the user gets.
  const [manifestMembers, setManifestMembers] = useState<TeamMember[]>([]);
  const [manifestSource, setManifestSource] = useState<Project | null>(null);
  const [hiring, setHiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detection pass: load manifests in parallel with the heuristic
  // recommendation. Manifest beats heuristic when both exist.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const list = projects ?? [];
      // First manifest wins. If the workspace has multiple repos, the
      // user can re-export the merged team from the Repo tab.
      let foundManifest: { project: Project; members: TeamMember[] } | null = null;
      for (const p of list) {
        const m = await readTeamManifest(p.repoPath);
        if (m && m.agents.length > 0) {
          foundManifest = { project: p, members: m.agents };
          break;
        }
      }

      if (cancelled) return;

      if (foundManifest) {
        setManifestSource(foundManifest.project);
        setManifestMembers(foundManifest.members);
        const ids = new Set(
          foundManifest.members
            .map((m) => m.role)
            .filter((r): r is RoleId => (ROLE_IDS as readonly string[]).includes(r)),
        );
        setRecommended(ids);
        setSelected(ids);
        return;
      }

      const rec = await recommendTeam(list);
      if (cancelled) return;
      setManifestSource(null);
      setManifestMembers([]);
      setRecommended(rec.recommended);
      setSelected(new Set(rec.recommended));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projects]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setRecommended(new Set());
      setManifestSource(null);
      setManifestMembers([]);
      setHiring(false);
      setError(null);
    }
  }, [open]);

  const fromManifest = manifestMembers.length > 0;
  /** Build a fast lookup for overrides when we hire from a manifest. */
  const memberByRole = new Map(manifestMembers.map((m) => [m.role, m]));

  const roleDefs = ROLE_IDS.map((id) =>
    agentDefs.find((d) => d.config.id === id),
  ).filter((d): d is NonNullable<typeof d> => !!d);

  function toggle(id: RoleId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleHire() {
    if (!workspace || selected.size === 0) return;
    setHiring(true);
    setError(null);
    try {
      // Hire in sequence (not Promise.all) — agent creation writes to
      // disk and shares a workspace registry, so a serial flow keeps the
      // file watcher events ordered.
      let i = 0;
      for (const roleId of selected) {
        const def = agentDefs.find((d) => d.config.id === roleId);
        if (!def) continue;
        // Manifest overrides take priority over our default fall-throughs
        // so a repo's `.squad/team.json` reproduces exactly the team the
        // author committed (names + colors), not Squad's defaults.
        const member = memberByRole.get(roleId);
        const name = member?.name?.trim() || def.config.name;
        const color = member?.color || AGENT_COLORS[i % AGENT_COLORS.length].id;
        await create(
          workspace.id,
          name,
          def.config.id,
          color,
          def.config.claudeMd,
          def.path,
          def.config.agentSeeds,
        );
        i += 1;
      }
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setHiring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle>
            {fromManifest ? t("recruit.titleFromManifest") : t("recruit.title")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {fromManifest
              ? t("recruit.subtitleFromManifest", { repo: manifestSource?.name ?? "" })
              : t("recruit.subtitle")}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-2">
            {roleDefs.map((def) => {
              const isSelected = selected.has(def.config.id as RoleId);
              const isRecommended = recommended.has(def.config.id as RoleId);
              const member = memberByRole.get(def.config.id);
              // The role's display name in this row: manifest override
              // wins so a repo that renamed Maya → Lisa shows "Lisa" here.
              const displayName = member?.name?.trim() || def.config.name;
              return (
                <label
                  key={def.config.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                    isSelected
                      ? "border-foreground/30 bg-accent/50"
                      : "border-border hover:bg-accent/30",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(def.config.id as RoleId)}
                    className="mt-1 size-4 shrink-0"
                  />
                  <AgentAvatar config={def.config} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{displayName}</span>
                      {member ? (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {t("recruit.fromManifest")}
                        </Badge>
                      ) : isRecommended ? (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {t("recruit.recommended")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {def.config.description}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          {error && (
            <p className="text-xs text-destructive mt-3">{error}</p>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {t("recruit.selectedCount", { count: selected.size })}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => setOpen(false)}
              disabled={hiring}
            >
              {t("recruit.cancel")}
            </Button>
            <Button
              className="rounded-full"
              onClick={() => void handleHire()}
              disabled={selected.size === 0 || hiring}
            >
              {hiring && <Spinner className="size-3 mr-1" />}
              {t("recruit.hireAction", { count: selected.size })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
