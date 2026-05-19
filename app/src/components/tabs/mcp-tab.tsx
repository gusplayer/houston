import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Server, ChevronDown, ChevronRight } from "lucide-react";
import { Button, Badge, Spinner } from "@squad/core";
import type { TabProps } from "../../lib/types";
import { useMcpConfig, useSaveMcpConfig } from "../../hooks/queries";
import type { McpConfig, McpServerConfig } from "@squad/engine-client";

const EMPTY_SERVER: McpServerConfig = { command: "", args: [], env: {} };

export default function McpTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;

  const { data: config, isLoading } = useMcpConfig(path);
  const saveConfig = useSaveMcpConfig(path);

  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newServer, setNewServer] = useState<McpServerConfig>({ ...EMPTY_SERVER });

  const servers = config?.mcpServers ?? {};

  async function handleDelete(name: string) {
    const updated: McpConfig = {
      mcpServers: Object.fromEntries(
        Object.entries(servers).filter(([k]) => k !== name),
      ),
    };
    await saveConfig.mutateAsync(updated);
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    const args = (newServer.args as unknown as string)
      .toString()
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean);
    const updated: McpConfig = {
      mcpServers: {
        ...servers,
        [newName.trim()]: { ...newServer, args },
      },
    };
    await saveConfig.mutateAsync(updated);
    setShowAddForm(false);
    setNewName("");
    setNewServer({ ...EMPTY_SERVER });
  }

  async function handleUpdateField(
    name: string,
    field: keyof McpServerConfig,
    value: string,
  ) {
    const current = servers[name] ?? {};
    const updated: McpConfig = {
      mcpServers: {
        ...servers,
        [name]: { ...current, [field]: field === "args" ? value.split(" ").filter(Boolean) : value },
      },
    };
    await saveConfig.mutateAsync(updated);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  const serverList = Object.entries(servers);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium">{t("mcp.title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("mcp.description")}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="size-3 mr-1" />
            {t("mcp.addServer")}
          </Button>
        </div>

        {/* Add server form */}
        {showAddForm && (
          <div className="border border-border rounded-lg p-4 mb-4 bg-muted/20">
            <p className="text-xs font-medium mb-3">{t("mcp.newServer")}</p>
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.serverName")}</label>
                  <input
                    className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="playwright"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.command")}</label>
                  <input
                    className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="npx"
                    value={newServer.command ?? ""}
                    onChange={(e) => setNewServer((s) => ({ ...s, command: e.target.value }))}
                  />
                </div>
                <div className="flex-[2]">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.args")}</label>
                  <input
                    className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="@playwright/mcp@latest"
                    value={Array.isArray(newServer.args) ? newServer.args.join(" ") : ""}
                    onChange={(e) => setNewServer((s) => ({ ...s, args: e.target.value.split(" ").filter(Boolean) }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.url")}</label>
                <input
                  className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="https://... (optional, for remote SSE servers)"
                  value={newServer.url ?? ""}
                  onChange={(e) => setNewServer((s) => ({ ...s, url: e.target.value || undefined }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => void handleAdd()}
                disabled={!newName.trim() || saveConfig.isPending}
              >
                {saveConfig.isPending ? <Spinner className="size-3 mr-1" /> : null}
                {t("mcp.add")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setShowAddForm(false)}
              >
                {t("mcp.cancel")}
              </Button>
            </div>
          </div>
        )}

        {/* Server list */}
        {serverList.length === 0 && !showAddForm ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <Server className="size-8 opacity-30" />
            <p className="text-sm">{t("mcp.empty")}</p>
            <p className="text-xs opacity-60 text-center max-w-xs">{t("mcp.emptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {serverList.map(([name, srv]) => (
              <div
                key={name}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/50 text-left"
                  onClick={() => setExpandedServer((v) => (v === name ? null : name))}
                >
                  {expandedServer === name ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Server className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium">{name}</span>
                  {srv.command && (
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {srv.command} {(srv.args ?? []).join(" ")}
                    </span>
                  )}
                  {srv.url && (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto mr-2">
                      SSE
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 ml-auto text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(name);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </button>

                {expandedServer === name && (
                  <div className="px-4 pb-3 pt-1 border-t border-border bg-muted/10 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.command")}</label>
                        <input
                          className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                          value={srv.command ?? ""}
                          onChange={(e) => void handleUpdateField(name, "command", e.target.value)}
                        />
                      </div>
                      <div className="flex-[2]">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.args")}</label>
                        <input
                          className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                          value={(srv.args ?? []).join(" ")}
                          onChange={(e) => void handleUpdateField(name, "args", e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("mcp.url")}</label>
                      <input
                        className="w-full h-7 mt-0.5 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        value={srv.url ?? ""}
                        onChange={(e) => void handleUpdateField(name, "url", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
