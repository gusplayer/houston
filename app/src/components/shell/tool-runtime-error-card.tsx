import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BugIcon, RotateCcwIcon, WrenchIcon } from "lucide-react";
import { Button, Spinner } from "@houston-ai/core";
import type { ToolRuntimeErrorEntry } from "@houston-ai/chat";
import { reportBug } from "../../lib/bug-report";
import { getCurrentUserEmail } from "../../lib/current-user";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

interface ToolRuntimeErrorCardProps {
  error: ToolRuntimeErrorEntry;
  onRetry?: () => Promise<void> | void;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function ToolRuntimeErrorCard({
  error,
  onRetry,
}: ToolRuntimeErrorCardProps) {
  const { t } = useTranslation(["shell", "common"]);
  const addToast = useUIStore((s) => s.addToast);
  const workspaceName = useWorkspaceStore((s) => s.current?.name);
  const [retrying, setRetrying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanedDetails = error.details ? stripAnsi(error.details).trim() : "";
  const hasDetails =
    cleanedDetails.length > 0 &&
    cleanedDetails !== "no stderr output captured";

  const onCopy = () => {
    navigator.clipboard.writeText(cleanedDetails);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const retry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      addToast({
        title: t("shell:toolRuntimeError.retryErrorTitle"),
        variant: "error",
      });
    } finally {
      setRetrying(false);
    }
  };

  const report = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      await reportBug({
        command: `tool_runtime_error:${error.kind}`,
        error: error.details || "No diagnostic details captured.",
        timestamp: new Date().toISOString(),
        appVersion: __APP_VERSION__,
        userEmail: getCurrentUserEmail(),
        workspaceName,
      });
      addToast({
        title: t("shell:toolRuntimeError.reportSuccessTitle"),
        description: t("shell:toolRuntimeError.reportSuccessDescription"),
        variant: "success",
      });
    } catch {
      addToast({
        title: t("shell:toolRuntimeError.reportErrorTitle"),
        description: t("shell:toolRuntimeError.reportErrorDescription"),
        variant: "error",
      });
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="w-full px-1 py-2">
      <div className="flex items-start gap-4 rounded-2xl bg-secondary p-4 text-left">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
          <WrenchIcon className="size-5" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">
            {t("shell:toolRuntimeError.title")}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("shell:toolRuntimeError.body")}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onRetry && (
              <Button
                onClick={retry}
                className="h-8 gap-2 rounded-full px-3 text-xs"
                size="sm"
                disabled={retrying}
              >
                {retrying ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <RotateCcwIcon className="size-3.5" />
                )}
                {t("common:actions.tryAgain")}
              </Button>
            )}
            <Button
              onClick={report}
              className="h-8 gap-2 rounded-full px-3 text-xs"
              size="sm"
              variant="outline"
              disabled={reporting}
            >
              {reporting ? (
                <Spinner className="size-3.5" />
              ) : (
                <BugIcon className="size-3.5" />
              )}
              {reporting
                ? t("shell:toolRuntimeError.reporting")
                : t("shell:toolRuntimeError.report")}
            </Button>
          </div>

          {hasDetails && (
            <>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline self-start"
              >
                {t(
                  showDetails
                    ? "shell:toolRuntimeError.hideDetails"
                    : "shell:toolRuntimeError.showDetails",
                )}
              </button>
              {showDetails && (
                <>
                  <pre className="mt-2 max-h-60 overflow-auto rounded-md border border-border bg-background p-3 text-xs font-mono whitespace-pre-wrap break-all text-foreground">
                    {cleanedDetails}
                  </pre>
                  <Button
                    onClick={onCopy}
                    className="mt-2 h-7 gap-2 rounded-full px-3 text-xs self-start"
                    size="sm"
                    variant="outline"
                  >
                    {copied
                      ? t("shell:toolRuntimeError.copyDetailsSuccess")
                      : t("shell:toolRuntimeError.copyDetails")}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
