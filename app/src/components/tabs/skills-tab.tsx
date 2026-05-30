import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Library } from "lucide-react";
import { Button } from "@squad/core";
import { SkillDetailPage } from "@squad/skills";
import type { TabProps } from "../../lib/types";
import { LibraryDialog } from "../library/library-dialog";
import { SkillsContent } from "./skills-content";
import { useSkillSurface } from "./use-skill-surface";

export default function SkillsTab({ agent }: TabProps) {
  const { t } = useTranslation("skills");
  const { t: tLibrary } = useTranslation("library");
  const surface = useSkillSurface(agent.folderPath);
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">{t("page.title")}</h2>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {t("page.description")}
            </p>
          </div>
          {!surface.selectedSkill && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLibraryOpen(true)}
            >
              <Library className="mr-1 size-3.5" />
              {tLibrary("skillsTab.browse")}
            </Button>
          )}
        </div>
        {surface.selectedSkill ? (
          <SkillDetailPage
            skill={surface.selectedSkill}
            onBack={surface.clearSelectedSkill}
            onSave={surface.handleSkillSave}
            onDelete={surface.handleSkillDelete}
            labels={surface.skillDetailLabels}
          />
        ) : (
          <SkillsContent
            skills={surface.skills}
            loading={surface.skillsLoading}
            onSkillClick={surface.selectSkill}
            onSearch={surface.handleSearch}
            onPopular={surface.handlePopular}
            onInstallCommunity={surface.handleInstallCommunity}
            onListFromRepo={surface.handleListFromRepo}
            onInstallFromRepo={surface.handleInstallFromRepo}
            installedSkillNames={surface.installedSkillNames}
          />
        )}
      </div>
      <LibraryDialog
        open={libraryOpen}
        kind="skill"
        agentPath={agent.folderPath}
        installedInAgent={surface.installedSkillNames}
        onOpenChange={setLibraryOpen}
      />
    </div>
  );
}
