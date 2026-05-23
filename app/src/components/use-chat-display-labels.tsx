import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Shimmer } from "@squad/chat";
import type { ChatPanelProps } from "@squad/chat";

export function useChatDisplayLabels(): Pick<
  ChatPanelProps,
  "processLabels" | "getThinkingMessage" | "rawViewLabels"
> {
  const { t } = useTranslation("chat");
  const processLabels = useMemo(
    () => ({
      active: t("process.active"),
      complete: t("process.complete"),
    }),
    [t],
  );
  const getThinkingMessage = useCallback<
    NonNullable<ChatPanelProps["getThinkingMessage"]>
  >(
    (isStreaming, duration) => {
      if (isStreaming || duration === 0) {
        return <Shimmer duration={1}>{t("reasoning.thinking")}</Shimmer>;
      }
      if (duration === undefined) return <span>{t("reasoning.thoughtForFew")}</span>;
      return <span>{t("reasoning.thoughtFor", { count: duration })}</span>;
    },
    [t],
  );
  const rawViewLabels = useMemo<ChatPanelProps["rawViewLabels"]>(
    () => ({
      toggle: {
        enterRaw: t("rawView.enterRaw"),
        enterChat: t("rawView.enterChat"),
      },
      stream: {
        empty: t("rawView.empty"),
        expand: t("rawView.expand"),
        collapse: t("rawView.collapse"),
      },
    }),
    [t],
  );

  return { processLabels, getThinkingMessage, rawViewLabels };
}
