import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";
import type { Sprint, Story } from "@squad/engine-client";

function now() {
  return new Date().toISOString();
}

// Sprints/stories used to live under each agent's `.squad/sprints/` +
// `.squad/stories/`. With F.2 they live at the workspace root so every
// agent in the workspace works against the same Kanban. `rootPath` here
// is the workspace folder's absolute path (workspace.path on the engine
// Workspace type) — the actual JSON I/O is the same, only the root
// changes. The engine's read_agent_file / write_agent_file endpoints
// don't validate the root must be an agent, so we reuse them.

// ─── Sprints ──────────────────────────────────────────────────────────

async function readSprints(rootPath: string): Promise<Sprint[]> {
  const raw = await tauriAgent.readFile(rootPath, ".squad/sprints/sprints.json");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Sprint[];
  } catch {
    return [];
  }
}

async function writeSprints(rootPath: string, sprints: Sprint[]): Promise<void> {
  await tauriAgent.writeFile(rootPath, ".squad/sprints/sprints.json", JSON.stringify(sprints, null, 2));
}

export function useSprints(rootPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sprints(rootPath ?? ""),
    queryFn: () => readSprints(rootPath!),
    enabled: !!rootPath,
  });
}

export function useCreateSprint(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<Sprint, "name" | "goal" | "startDate" | "endDate">) => {
      const sprints = await readSprints(rootPath!);
      const newSprint: Sprint = {
        id: crypto.randomUUID(),
        name: input.name,
        goal: input.goal,
        status: "planning",
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        createdAt: now(),
        updatedAt: now(),
      };
      await writeSprints(rootPath!, [...sprints, newSprint]);
      return newSprint;
    },
    onSuccess: () => { if (rootPath) qc.invalidateQueries({ queryKey: queryKeys.sprints(rootPath) }); },
  });
}

export function useUpdateSprint(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Sprint> }) => {
      const sprints = await readSprints(rootPath!);
      await writeSprints(rootPath!, sprints.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now() } : s,
      ));
    },
    onSuccess: () => { if (rootPath) qc.invalidateQueries({ queryKey: queryKeys.sprints(rootPath) }); },
  });
}

export function useDeleteSprint(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sprints = await readSprints(rootPath!);
      await writeSprints(rootPath!, sprints.filter((s) => s.id !== id));
    },
    onSuccess: () => { if (rootPath) qc.invalidateQueries({ queryKey: queryKeys.sprints(rootPath) }); },
  });
}

// ─── Stories ─────────────────────────────────────────────────────────

async function readStories(rootPath: string): Promise<Story[]> {
  const raw = await tauriAgent.readFile(rootPath, ".squad/stories/stories.json");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Story[];
  } catch {
    return [];
  }
}

async function writeStories(rootPath: string, stories: Story[]): Promise<void> {
  await tauriAgent.writeFile(rootPath, ".squad/stories/stories.json", JSON.stringify(stories, null, 2));
}

export function useStories(rootPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stories(rootPath ?? ""),
    queryFn: () => readStories(rootPath!),
    enabled: !!rootPath,
  });
}

export function useCreateStory(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Story, "id" | "createdAt" | "updatedAt">) => {
      const stories = await readStories(rootPath!);
      const newStory: Story = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now(),
        updatedAt: now(),
      };
      await writeStories(rootPath!, [...stories, newStory]);
      return newStory;
    },
    onSuccess: () => { if (rootPath) qc.invalidateQueries({ queryKey: queryKeys.stories(rootPath) }); },
  });
}

export function useUpdateStory(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Story> }) => {
      const stories = await readStories(rootPath!);
      await writeStories(rootPath!, stories.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now() } : s,
      ));
    },
    onSuccess: () => { if (rootPath) qc.invalidateQueries({ queryKey: queryKeys.stories(rootPath) }); },
  });
}

export function useDeleteStory(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const stories = await readStories(rootPath!);
      await writeStories(rootPath!, stories.filter((s) => s.id !== id));
    },
    onSuccess: () => { if (rootPath) qc.invalidateQueries({ queryKey: queryKeys.stories(rootPath) }); },
  });
}
