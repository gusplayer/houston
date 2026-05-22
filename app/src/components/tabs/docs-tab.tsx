import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, FileText, Trash2, Globe2, User as UserIcon, Users, Building2 } from "lucide-react";
import {
  Button,
  Spinner,
  Badge,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@squad/core";
import type { TabProps } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import {
  useProjectDocs,
  useSaveProjectDoc,
  useDeleteProjectDoc,
} from "../../hooks/queries";
import {
  DOC_TEMPLATES,
  parseFrontmatter,
  type DocFrontmatter,
  type ProjectDoc,
} from "../../lib/project-docs";
import { ROLE_IDS } from "../../lib/recommend-team";

type Scope = "workspace" | "agent";

export default function DocsTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const workspace = useWorkspaceStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const agentPath = agent.folderPath;
  const workspacePath = workspace?.path;

  const [scope, setScope] = useState<Scope>("workspace");
  const root = scope === "workspace" ? workspacePath : agentPath;

  const { data: docs, isLoading } = useProjectDocs(root);
  const saveDoc = useSaveProjectDoc(root);
  const deleteDoc = useDeleteProjectDoc(root);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);

  // Keep activeSlug in sync with the docs list — drop selection if the
  // file vanished (deleted or scope changed).
  useEffect(() => {
    if (!activeSlug) return;
    if (!docs?.some((d) => d.slug === activeSlug)) {
      setActiveSlug(null);
    }
  }, [docs, activeSlug]);

  const active = docs?.find((d) => d.slug === activeSlug) ?? null;

  async function createFromTemplate(slug: string, fm: DocFrontmatter, body: string) {
    // Suffix the slug if the doc already exists in this scope so the
    // editor doesn't silently overwrite an existing file.
    let finalSlug = slug;
    let n = 2;
    while (docs?.some((d) => d.slug === finalSlug)) {
      finalSlug = `${slug}-${n++}`;
    }
    await saveDoc.mutateAsync({ slug: finalSlug, frontmatter: fm, body });
    setActiveSlug(finalSlug);
    setShowNewMenu(false);
  }

  async function createBlank() {
    let finalSlug = "untitled";
    let n = 2;
    while (docs?.some((d) => d.slug === finalSlug)) {
      finalSlug = `untitled-${n++}`;
    }
    await saveDoc.mutateAsync({
      slug: finalSlug,
      frontmatter: { title: t("docs.untitledTitle") },
      body: "",
    });
    setActiveSlug(finalSlug);
    setShowNewMenu(false);
  }

  if (isLoading || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Scope toggle + new */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0">
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          <button
            className={cn(
              "h-7 px-2 text-xs flex items-center gap-1 transition-colors",
              scope === "workspace"
                ? "bg-accent text-accent-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setScope("workspace");
              setActiveSlug(null);
            }}
          >
            <Building2 className="size-3" />
            {t("docs.scopeWorkspace")}
          </button>
          <button
            className={cn(
              "h-7 px-2 text-xs flex items-center gap-1 transition-colors border-l border-border",
              scope === "agent"
                ? "bg-accent text-accent-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
            onClick={() => {
              setScope("agent");
              setActiveSlug(null);
            }}
          >
            <UserIcon className="size-3" />
            {t("docs.scopeAgent", { name: agent.name })}
          </button>
        </div>

        <span className="text-[11px] text-muted-foreground">
          {scope === "workspace"
            ? t("docs.scopeWorkspaceHint")
            : t("docs.scopeAgentHint")}
        </span>

        <div className="ml-auto relative">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setShowNewMenu((v) => !v)}
          >
            <Plus className="size-3 mr-1" />
            {t("docs.newDoc")}
          </Button>
          {showNewMenu && (
            <div className="absolute right-0 top-8 z-50 w-64 rounded-lg border border-border bg-card shadow-lg p-1">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("docs.templates")}
              </div>
              {DOC_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.slug}
                  onClick={() => void createFromTemplate(tpl.slug, tpl.frontmatter, tpl.body)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2"
                >
                  <FileText className="size-3 text-muted-foreground" />
                  <span className="flex-1">{tpl.title}</span>
                  {tpl.frontmatter.audience && tpl.frontmatter.audience.length > 0 && (
                    <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                      {tpl.frontmatter.audience.length === 1
                        ? t("docs.roleSingular")
                        : t("docs.rolePlural", { count: tpl.frontmatter.audience.length })}
                    </Badge>
                  )}
                </button>
              ))}
              <div className="border-t border-border my-1" />
              <button
                onClick={() => void createBlank()}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2"
              >
                <Plus className="size-3 text-muted-foreground" />
                {t("docs.blankDoc")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left list */}
        <div className="w-56 shrink-0 border-r border-border overflow-auto">
          {(docs ?? []).length === 0 ? (
            <div className="p-4 text-center">
              <FileText className="size-6 mx-auto opacity-30 text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-2">{t("docs.empty")}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {(docs ?? []).map((d) => {
                const aud = d.frontmatter.audience ?? [];
                const universal = aud.length === 0;
                const label = d.frontmatter.title?.trim() || d.slug;
                return (
                  <button
                    key={d.slug}
                    onClick={() => setActiveSlug(d.slug)}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent border-b border-border/40",
                      activeSlug === d.slug && "bg-accent",
                    )}
                  >
                    <FileText className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{label}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {universal ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Globe2 className="size-2.5" />
                            {t("docs.audienceAll")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Users className="size-2.5" />
                            {t("docs.audienceCount", { count: aud.length })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="flex-1 min-w-0 overflow-auto">
          {active ? (
            <DocEditor
              key={`${root}:${active.slug}`}
              doc={active}
              scope={scope}
              availableRoles={ROLE_IDS}
              agentsForLookup={agents}
              onSave={(fm, body) =>
                saveDoc.mutateAsync({ slug: active.slug, frontmatter: fm, body })
              }
              onDelete={async () => {
                await deleteDoc.mutateAsync(active.slug);
                setActiveSlug(null);
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
              {t("docs.pickOrCreate")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────

interface DocEditorProps {
  doc: ProjectDoc;
  scope: Scope;
  availableRoles: readonly string[];
  agentsForLookup: { id: string; name: string; configId: string }[];
  onSave: (fm: DocFrontmatter, body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

function DocEditor({ doc, scope, availableRoles, onSave, onDelete }: DocEditorProps) {
  const { t } = useTranslation("agents");
  const [title, setTitle] = useState(doc.frontmatter.title ?? "");
  const [body, setBody] = useState(doc.body);
  const [audience, setAudience] = useState<string[]>(doc.frontmatter.audience ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset state when switching docs (keyed by parent re-mount, but also
  // belt-and-suspenders here if React reuses the instance).
  useEffect(() => {
    setTitle(doc.frontmatter.title ?? "");
    setBody(doc.body);
    setAudience(doc.frontmatter.audience ?? []);
    setDirty(false);
  }, [doc.slug]);

  // Autosave with a short debounce — matches the AutoSaveTextarea pattern
  // we use elsewhere without pulling in that component (it expects a
  // single field, not a triple).
  useEffect(() => {
    if (!dirty) return;
    const handle = setTimeout(() => {
      setSaving(true);
      onSave({ title: title || undefined, audience: audience.length > 0 ? audience : undefined }, body)
        .finally(() => {
          setSaving(false);
          setDirty(false);
        });
    }, 600);
    return () => clearTimeout(handle);
  }, [dirty, title, body, audience, onSave]);

  function toggleRole(role: string) {
    setAudience((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
    setDirty(true);
  }

  const universal = audience.length === 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border shrink-0 flex items-center gap-2">
        <input
          className="flex-1 bg-transparent text-sm font-semibold focus:outline-none"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          placeholder={t("docs.titlePlaceholder")}
        />
        <span className="text-[10px] text-muted-foreground">
          {saving ? t("docs.saving") : dirty ? t("docs.unsaved") : t("docs.saved")}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => void onDelete()}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Audience — only meaningful at workspace scope. Per-agent docs
          are private to that agent, so audience doesn't apply. */}
      {scope === "workspace" && (
        <div className="px-4 py-2 border-b border-border bg-muted/20 shrink-0 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground">{t("docs.audienceLabel")}</span>
          <button
            onClick={() => {
              setAudience([]);
              setDirty(true);
            }}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
              universal
                ? "border-foreground/30 bg-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("docs.audienceAll")}
          </button>
          {availableRoles.map((role) => (
            <button
              key={role}
              onClick={() => toggleRole(role)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                audience.includes(role)
                  ? "border-foreground/30 bg-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`docs.roleLabel.${role}`, { defaultValue: role })}
            </button>
          ))}
        </div>
      )}

      <Select
        value="__current__"
        onValueChange={() => {}}
      >
        <SelectTrigger className="hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__current__">noop</SelectItem>
        </SelectContent>
      </Select>

      <textarea
        className="flex-1 px-4 py-3 bg-background text-xs leading-relaxed font-mono resize-none focus:outline-none"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setDirty(true);
        }}
        placeholder={t("docs.bodyPlaceholder")}
      />
    </div>
  );
}

/** Stub re-export so Vite picks up the chunk's exported parser even when
 * tree-shaken — useful when other modules also want to parse on the fly. */
export { parseFrontmatter };
