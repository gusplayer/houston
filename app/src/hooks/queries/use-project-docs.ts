import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDoc,
  listDocs,
  saveDoc,
  type DocFrontmatter,
} from "../../lib/project-docs";

const KEY = (root: string) => ["project-docs", root] as const;

export function useProjectDocs(rootPath: string | undefined) {
  return useQuery({
    queryKey: KEY(rootPath ?? ""),
    queryFn: () => listDocs(rootPath!),
    enabled: !!rootPath,
  });
}

export function useSaveProjectDoc(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      slug: string;
      frontmatter: DocFrontmatter;
      body: string;
    }) => {
      await saveDoc(rootPath!, input.slug, input.frontmatter, input.body);
    },
    onSuccess: () => {
      if (rootPath) qc.invalidateQueries({ queryKey: KEY(rootPath) });
    },
  });
}

export function useDeleteProjectDoc(rootPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      await deleteDoc(rootPath!, slug);
    },
    onSuccess: () => {
      if (rootPath) qc.invalidateQueries({ queryKey: KEY(rootPath) });
    },
  });
}
