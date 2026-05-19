import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ProviderPicker } from "../../shell/provider-picker";
import { SquadCreditsTopUpDialog } from "../../squad-credits-topup-dialog";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { useUIStore } from "../../../stores/ui";
import { useSquadCreditsStore } from "../../../stores/squad-credits";
import { Button } from "@squad/core";

export function ProviderSection() {
  const { t } = useTranslation(["settings", "providers"]);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const updateProvider = useWorkspaceStore((s) => s.updateProvider);
  const addToast = useUIStore((s) => s.addToast);
  const creditsBalance = useSquadCreditsStore((s) => s.balance);

  if (!currentWorkspace) return null;

  const handleProviderSelect = async (provider: string, model: string) => {
    await updateProvider(currentWorkspace.id, provider, model);
    const provName =
      provider === "openai"
        ? "OpenAI"
        : provider === "squad-credits"
          ? "Squad Credits"
          : "Anthropic";
    addToast({
      title: t("settings:toasts.providerSwitched", { provider: provName, model }),
    });
  };

  const usingCredits = currentWorkspace.provider === "squad-credits";

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("settings:provider.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        <Trans
          i18nKey="settings:provider.description"
          components={{ emph: <strong className="text-foreground font-medium" /> }}
        />
      </p>
      <ProviderPicker
        value={currentWorkspace.provider ?? null}
        model={currentWorkspace.model ?? null}
        onSelect={handleProviderSelect}
      />
      {usingCredits && creditsBalance !== null && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-black/5 bg-background px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t("providers:credits.settingsBalance", { count: creditsBalance })}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => setTopUpOpen(true)}
          >
            {t("providers:credits.topUp")}
          </Button>
        </div>
      )}
      <SquadCreditsTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </section>
  );
}
