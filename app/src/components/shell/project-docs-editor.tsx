import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, FileText } from "lucide-react";
import { Button, Spinner, cn } from "@squad/core";
import {
  PROJECT_DOC_LABELS,
  type ProjectDocSlug,
} from "@squad/engine-client";
import {
  useProjectScopedDoc,
  useSaveProjectScopedDoc,
} from "../../hooks/queries";

const DOCS: ProjectDocSlug[] = ["claude-md", "rules", "architecture"];

/**
 * Inline editor for the three project-scoped docs that live under
 * `<workspace>/.squad/projects/<id>/`. Drives the same files the
 * engine reads when assembling an agent's system prompt, so a save
 * here changes what every bound agent sees on its next session.
 */
export function ProjectDocsEditor({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { t } = useTranslation("shell");
  const [active, setActive] = useState<ProjectDocSlug>("claude-md");

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border bg-background">
        <FileText className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground mr-2">
          {t("workspace.projectDocs.title")}
        </span>
        {DOCS.map((doc) => (
          <button
            key={doc}
            onClick={() => setActive(doc)}
            className={cn(
              "text-[11px] h-6 px-2 rounded-full transition-colors",
              active === doc
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PROJECT_DOC_LABELS[doc]}
          </button>
        ))}
      </div>
      <DocEditorPane
        key={`${projectId}-${active}`}
        workspaceId={workspaceId}
        projectId={projectId}
        doc={active}
      />
    </div>
  );
}

function DocEditorPane({
  workspaceId,
  projectId,
  doc,
}: {
  workspaceId: string;
  projectId: string;
  doc: ProjectDocSlug;
}) {
  const { t } = useTranslation("shell");
  const { data, isLoading } = useProjectScopedDoc(workspaceId, projectId, doc);
  const save = useSaveProjectScopedDoc(workspaceId, projectId);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Hydrate the textarea from the server payload exactly once per
  // (project, doc) mount — re-rendering the parent must not overwrite
  // an in-progress edit, which is why this component is keyed.
  useEffect(() => {
    if (data && !dirty) {
      setDraft(data.content);
    }
  }, [data, dirty]);

  async function handleSave() {
    await save.mutateAsync({ doc, content: draft });
    setDirty(false);
    setSavedAt(Date.now());
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Spinner className="size-4" />
      </div>
    );
  }

  const placeholder = t(`workspace.projectDocs.placeholder.${doc}` as const);

  return (
    <div className="flex flex-col">
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
          setSavedAt(null);
        }}
        placeholder={placeholder}
        className="w-full min-h-[180px] resize-y px-3 py-2 text-xs bg-background font-mono leading-relaxed outline-none focus:ring-1 focus:ring-ring"
        spellCheck={false}
      />
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background">
        <span className="text-[10px] text-muted-foreground flex-1">
          {dirty
            ? t("workspace.projectDocs.unsaved")
            : savedAt !== null
            ? t("workspace.projectDocs.saved")
            : t("workspace.projectDocs.hint")}
        </span>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => void handleSave()}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? (
            <Spinner className="size-3 mr-1" />
          ) : (
            <Check className="size-3 mr-1" />
          )}
          {t("workspace.projectDocs.save")}
        </Button>
      </div>
    </div>
  );
}
