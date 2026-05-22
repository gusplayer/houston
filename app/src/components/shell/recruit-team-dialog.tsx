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
import { AgentAvatar } from "./agent-avatar";

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
  const [hiring, setHiring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute recommendations on open. Detection reads package.json + a
  // few config files from each project — runs in parallel and cheap
  // enough that we don't need to memo it.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    recommendTeam(projects ?? []).then((rec) => {
      if (cancelled) return;
      setRecommended(rec.recommended);
      // Default the selection to whatever was recommended.
      setSelected(new Set(rec.recommended));
    });
    return () => {
      cancelled = true;
    };
  }, [open, projects]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setRecommended(new Set());
      setHiring(false);
      setError(null);
    }
  }, [open]);

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
        const color = AGENT_COLORS[i % AGENT_COLORS.length].id;
        await create(
          workspace.id,
          def.config.name,
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
          <DialogTitle>{t("recruit.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("recruit.subtitle")}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-2">
            {roleDefs.map((def) => {
              const isSelected = selected.has(def.config.id as RoleId);
              const isRecommended = recommended.has(def.config.id as RoleId);
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
                      <span className="font-semibold text-sm">{def.config.name}</span>
                      {isRecommended && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {t("recruit.recommended")}
                        </Badge>
                      )}
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
