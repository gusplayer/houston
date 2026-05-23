import { useEffect } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  AGENT_COLORS,
  Button,
  DialogTitle,
  SquadAvatar,
  Input,
  cn,
  colorHex,
  resolveAgentColor,
} from "@squad/core";
import { ArrowLeft, Check, FolderOpen } from "lucide-react";
import type { AgentDefinition } from "../../lib/types";
import { InlineModelSelector } from "./inline-model-selector";

interface NamingStepProps {
  selectedAgent: AgentDefinition | undefined;
  name: string;
  color: string | undefined;
  error: string | null;
  existingPath: string | null;
  provider: string;
  model: string;
  /** Show "Link existing project" option (opt-in via agent features). */
  showLinkProject?: boolean;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onExistingPathChange: (path: string | null) => void;
  onProviderChange: (provider: string, model: string) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function NamingStep({
  selectedAgent,
  name,
  color,
  error,
  existingPath,
  provider,
  model,
  onNameChange,
  onColorChange,
  onExistingPathChange,
  showLinkProject,
  onProviderChange,
  onBack,
  onSubmit,
}: NamingStepProps) {
  const { t } = useTranslation("shell");
  // Default to white on mount if none selected
  const resolvedColor = resolveAgentColor(color);

  useEffect(() => {
    if (!color) {
      onColorChange(AGENT_COLORS[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16">
      <button
        onClick={onBack}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("naming.dialogTitle")}</DialogTitle>

      {/* Avatar preview — title reflects the input live so the user can
       *  see the agent's final name change as they type. Subtitle shows
       *  the role label (e.g. "UI/UX Designer") when picking from the
       *  team library so the user knows the template they chose without
       *  conflating it with the name. */}
      {(() => {
        const trimmedName = name.trim();
        const fallback = selectedAgent?.config.name ?? t("naming.newAgentFallback");
        const displayName = trimmedName.length > 0 ? trimmedName : fallback;
        const roleLabel = selectedAgent?.config.roleLabel;
        return (
          <div className="flex flex-col items-center gap-4 mb-8">
            <SquadAvatar color={resolvedColor} diameter={80} />
            <div className="text-center">
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {roleLabel ?? t("naming.tagline")}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Color palette */}
      <div className="flex items-center gap-2 mb-6">
        {AGENT_COLORS.map((c) => {
          const hex = colorHex(c);
          const isSelected = color === c.id || color === c.light || color === c.dark;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onColorChange(c.id)}
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150",
                isSelected
                  ? "ring-2 ring-offset-2 ring-foreground/30"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: hex }}
            >
              {isSelected && (
                <Check className="h-3.5 w-3.5 text-white" />
              )}
            </button>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={
            selectedAgent?.config.roleLabel
              ? selectedAgent.config.name
              : t("naming.namePlaceholder")
          }
          className="text-center rounded-full"
        />

        {/* Link existing project — opt-in via agent features */}
        {showLinkProject && (
          <div className="flex flex-col items-center gap-1.5">
            {existingPath ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary rounded-full px-3 py-1.5">
                <FolderOpen className="size-3" />
                <span className="truncate max-w-[200px]">{existingPath.split("/").pop()}</span>
                <button
                  type="button"
                  onClick={() => onExistingPathChange(null)}
                  className="text-muted-foreground hover:text-foreground ml-1"
                >
                  &times;
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const { tauriAgents } = await import("../../lib/tauri");
                  const picked = await tauriAgents.pickDirectory();
                  if (picked) {
                    onExistingPathChange(picked);
                    if (!name.trim()) {
                      const folderName = picked.replace(/\/$/, "").split("/").pop() ?? "";
                      onNameChange(folderName);
                    }
                  }
                }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <FolderOpen className="size-3" />
                {t("naming.linkExistingProject")}
              </button>
            )}
          </div>
        )}

        {/* AI model selector */}
        <InlineModelSelector
          provider={provider}
          model={model}
          onSelect={onProviderChange}
        />

        {error && (
          <p className="text-xs text-destructive text-center">{error}</p>
        )}
        <Button
          type="submit"
          disabled={!name.trim()}
          className="w-full rounded-full"
        >
          {t("naming.createAgent")}
        </Button>
      </form>
    </div>
  );
}
