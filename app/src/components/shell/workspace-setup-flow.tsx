import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation, Trans } from "react-i18next";
import { Button, Input } from "@squad/core";
import { tauriProvider } from "../../lib/tauri";
import { PROVIDERS } from "../../lib/providers";
import { ProviderPicker } from "./provider-picker";

interface Props {
  /** "page" = full-page onboarding, "dialog" = inside a modal */
  mode: "page" | "dialog";
  /** Called when the full flow completes */
  onComplete: (name: string, provider: string, model: string) => void;
}

/**
 * Resolve the first provider with `cli_installed && authenticated`. Order
 * matches the visual order in `PROVIDERS` so behavior is stable. Returns
 * null if neither is ready. Used by the step-1 → step-2 auto-skip.
 */
async function firstReadyProvider() {
  for (const p of PROVIDERS) {
    try {
      const status = await tauriProvider.checkStatus(p.id);
      if (status.cli_installed && status.authenticated) return p;
    } catch {
      // checkStatus failure (e.g. engine offline) just means "not ready" for
      // auto-skip purposes — fall through and let the picker render.
    }
  }
  return null;
}

export function WorkspaceSetupFlow({ mode, onComplete }: Props) {
  const { t } = useTranslation(["setup", "common"]);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("Personal");
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  /** Tracks whether we've already attempted the auto-skip so step 2 doesn't
   * fire it on every state change. The user can still hit Back → Continue and
   * we'll re-evaluate, which is what they want if they meanwhile connected. */
  const autoSkipAttempted = useRef(false);

  const handleNameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // If the user already has at least one provider connected, the provider
    // picker has zero actionable input — skip it and create the workspace with
    // the first ready provider's defaults. The user can swap models later in
    // settings. Keeps onboarding to a single step in the happy path.
    if (!autoSkipAttempted.current) {
      autoSkipAttempted.current = true;
      const ready = await firstReadyProvider();
      if (ready) {
        onComplete(name.trim(), ready.id, ready.defaultModel);
        return;
      }
    }
    setStep(2);
  };

  const handleProviderSelect = (p: string, m: string) => {
    setProvider(p);
    setModel(m);
  };

  const handleFinish = () => {
    if (!name.trim() || !provider || !model) return;
    onComplete(name.trim(), provider, model);
  };

  const isPage = mode === "page";

  if (step === 1) {
    return (
      <div className={isPage ? "flex flex-col items-center justify-center" : ""}>
        <div className={isPage ? "w-full max-w-sm" : "space-y-4 pt-2"}>
          {isPage && (
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold mb-1">{t("setup:name.title")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("setup:name.description")}
              </p>
            </div>
          )}
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("setup:name.placeholder")}
            />
            <div className={isPage ? "flex justify-center" : "flex justify-end"}>
              <Button
                type="submit"
                disabled={!name.trim()}
                className="rounded-full"
              >
                {t("common:actions.continue")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={isPage ? "flex flex-col items-center justify-center" : ""}>
      <div className={isPage ? "w-full max-w-md" : "space-y-4 pt-2"}>
        {/* Header */}
        <div className={isPage ? "text-center mb-6" : "mb-4"}>
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("common:actions.back")}
          </button>
          <h2 className={isPage ? "text-lg font-semibold mb-1" : "text-base font-medium mb-1"}>
            {t("setup:provider.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="setup:provider.description"
              defaults="Squad uses <emph>your own</emph> subscription. We never see your credentials."
              components={{
                emph: <strong className="text-foreground font-medium" />,
              }}
            />
          </p>
        </div>

        {/* Provider picker */}
        <ProviderPicker value={provider} model={model} onSelect={handleProviderSelect} />

        {/* Continue */}
        <div className={`mt-5 ${isPage ? "flex justify-center" : "flex justify-end"}`}>
          <Button
            className="rounded-full"
            disabled={!provider || !model}
            onClick={handleFinish}
          >
            {mode === "page"
              ? t("setup:provider.finishPage")
              : t("setup:provider.finishDialog")}
          </Button>
        </div>
      </div>
    </div>
  );
}
