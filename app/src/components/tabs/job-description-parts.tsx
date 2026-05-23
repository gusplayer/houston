import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, EmptyDescription, EmptyHeader, EmptyTitle } from "@squad/core";
import { FileText } from "lucide-react";
import { useAgentState } from "../../hooks/use-agent-state";
import { useWorkspaceStore } from "../../stores/workspaces";
import { tauriChat, tauriConfig, tauriProjects } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import type { SelectedFile, ProjectClaudeEntry } from "./instructions-file-tree";
import { InstructionsFileTree } from "./instructions-file-tree";
import { InstructionsProjectPanel } from "./instructions-project-panel";
import { InstructionsAgentEditor, type SaveState } from "./instructions-agent-editor";

export type SubTab = "instructions" | "skills" | "learnings";

export function InstructionsContent({
  content,
  onSave,
  agentPath,
  agentId,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  agentPath?: string;
  agentId?: string;
}) {
  const { t } = useTranslation("agents");

  // ── Agent editor state ──────────────────────────────────────────────
  const [value, setValue] = useState(content);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [restarting, setRestarting] = useState(false);

  const agentState = useAgentState(agentPath);
  const isSessionActive = agentState === "working";

  useEffect(() => {
    setValue(content);
  }, [content]);

  const textareaRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (el && editing) el.focus();
    },
    [editing],
  );

  const handleBlur = async () => {
    if (value === content) return;
    setSaveState("saving");
    await onSave(value);
    setSaveState(isSessionActive ? "saved-active" : "saved");
    if (!isSessionActive) window.setTimeout(() => setSaveState("idle"), 2000);
  };

  const handleRestart = async () => {
    if (!agentPath || !agentId) return;
    setRestarting(true);
    await tauriChat.stop(agentPath, `chat-${agentId}`).catch(() => {});
    setRestarting(false);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 2000);
  };

  // ── Project bindings ────────────────────────────────────────────────
  const workspace = useWorkspaceStore((s) => s.current);
  const wid = workspace?.id;

  const { data: agentConfig } = useQuery({
    queryKey: queryKeys.config(agentPath ?? ""),
    queryFn: () => tauriConfig.read(agentPath!),
    enabled: !!agentPath,
  });

  const { data: allProjects } = useQuery({
    queryKey: queryKeys.projects(wid ?? ""),
    queryFn: () => tauriProjects.list(wid!),
    enabled: !!wid,
  });

  const projectClaudes = useMemo<ProjectClaudeEntry[]>(() => {
    if (!allProjects) return [];
    return (agentConfig?.projectIds ?? [])
      .map((id) => allProjects.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ projectId: p.id, projectName: p.name, exists: true }));
  }, [allProjects, agentConfig?.projectIds]);

  // ── File tree selection ─────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<SelectedFile>("agent");

  useEffect(() => {
    if (typeof selectedFile === "object") {
      const still = projectClaudes.some((p) => p.projectId === selectedFile.projectId);
      if (!still) setSelectedFile("agent");
    }
  }, [projectClaudes, selectedFile]);

  const selectedProject =
    typeof selectedFile === "object" && allProjects
      ? allProjects.find((p) => p.id === selectedFile.projectId)
      : undefined;

  // ── Shared sidebar ──────────────────────────────────────────────────
  const sidebar = (
    <div className="sticky top-0 self-start">
      <InstructionsFileTree
        selectedFile={selectedFile}
        onSelectFile={setSelectedFile}
        projectClaudes={projectClaudes}
      />
    </div>
  );

  // ── Empty state ─────────────────────────────────────────────────────
  if (selectedFile === "agent" && !value.trim() && !editing) {
    return (
      <div className="flex w-full">
        {sidebar}
        <div className="flex-1 flex flex-col items-center gap-6 text-center px-6 pt-24">
          <EmptyHeader>
            <EmptyTitle>{t("instructions.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("instructions.emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setEditing(true)}>
            <FileText className="size-4" />
            {t("instructions.writeButton")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full">
      {sidebar}
      <div className="flex-1 flex flex-col">
        {selectedFile === "agent" ? (
          <InstructionsAgentEditor
            value={value}
            saveState={saveState}
            agentPath={agentPath}
            agentId={agentId}
            restarting={restarting}
            textareaRef={textareaRef}
            onChange={setValue}
            onBlur={handleBlur}
            onRestart={handleRestart}
          />
        ) : (
          <InstructionsProjectPanel
            projectName={selectedProject?.name ?? ""}
            repoPath={selectedProject?.repoPath}
          />
        )}
      </div>
    </div>
  );
}
