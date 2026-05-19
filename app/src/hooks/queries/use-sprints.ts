import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";
import type { Sprint, Story } from "@squad/engine-client";

function now() {
  return new Date().toISOString();
}

// ─── Sprints ──────────────────────────────────────────────────────────

async function readSprints(agentPath: string): Promise<Sprint[]> {
  const raw = await tauriAgent.readFile(agentPath, ".squad/sprints/sprints.json");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Sprint[];
  } catch {
    return [];
  }
}

async function writeSprints(agentPath: string, sprints: Sprint[]): Promise<void> {
  await tauriAgent.writeFile(agentPath, ".squad/sprints/sprints.json", JSON.stringify(sprints, null, 2));
}

export function useSprints(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sprints(agentPath ?? ""),
    queryFn: () => readSprints(agentPath!),
    enabled: !!agentPath,
  });
}

export function useCreateSprint(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<Sprint, "name" | "goal" | "startDate" | "endDate">) => {
      const sprints = await readSprints(agentPath!);
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
      await writeSprints(agentPath!, [...sprints, newSprint]);
      return newSprint;
    },
    onSuccess: () => { if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.sprints(agentPath) }); },
  });
}

export function useUpdateSprint(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Sprint> }) => {
      const sprints = await readSprints(agentPath!);
      await writeSprints(agentPath!, sprints.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now() } : s,
      ));
    },
    onSuccess: () => { if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.sprints(agentPath) }); },
  });
}

export function useDeleteSprint(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const sprints = await readSprints(agentPath!);
      await writeSprints(agentPath!, sprints.filter((s) => s.id !== id));
    },
    onSuccess: () => { if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.sprints(agentPath) }); },
  });
}

// ─── Stories ─────────────────────────────────────────────────────────

async function readStories(agentPath: string): Promise<Story[]> {
  const raw = await tauriAgent.readFile(agentPath, ".squad/stories/stories.json");
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Story[];
  } catch {
    return [];
  }
}

async function writeStories(agentPath: string, stories: Story[]): Promise<void> {
  await tauriAgent.writeFile(agentPath, ".squad/stories/stories.json", JSON.stringify(stories, null, 2));
}

export function useStories(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stories(agentPath ?? ""),
    queryFn: () => readStories(agentPath!),
    enabled: !!agentPath,
  });
}

export function useCreateStory(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<Story, "id" | "createdAt" | "updatedAt">) => {
      const stories = await readStories(agentPath!);
      const newStory: Story = {
        ...input,
        id: crypto.randomUUID(),
        createdAt: now(),
        updatedAt: now(),
      };
      await writeStories(agentPath!, [...stories, newStory]);
      return newStory;
    },
    onSuccess: () => { if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.stories(agentPath) }); },
  });
}

export function useUpdateStory(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Story> }) => {
      const stories = await readStories(agentPath!);
      await writeStories(agentPath!, stories.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now() } : s,
      ));
    },
    onSuccess: () => { if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.stories(agentPath) }); },
  });
}

export function useDeleteStory(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const stories = await readStories(agentPath!);
      await writeStories(agentPath!, stories.filter((s) => s.id !== id));
    },
    onSuccess: () => { if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.stories(agentPath) }); },
  });
}
