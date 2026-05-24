import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";

const DEFAULT_RULES = `## Security
- Never commit \`.env\` files, secrets, API keys, or credentials to version control
- Never hardcode passwords, tokens, or sensitive values in source code
- Use environment variables for all secrets and per-environment configuration

## Code Quality
- Write tests for every new feature — no exceptions
- Remove all debug statements (\`console.log\`, \`print\`, etc.) before committing
- Keep files under 200 lines; extract modules when approaching the limit

## Git
- Use conventional commits: \`feat:\`, \`fix:\`, \`chore:\`, \`docs:\`, \`refactor:\`
- Stage specific files — never \`git add -A\` or \`git add .\` blindly
- Commit messages in English

## Operations
- Read a file before editing it — never modify without reading current state
- Ask before destructive operations (delete, reset --hard, force push)
- Prefer reversible actions; explicitly flag irreversible ones

## AI Safety
- Never execute commands that could affect production without explicit confirmation
- Do not invent URLs, endpoints, or file paths you have not verified exist
- Surface all errors to the user — never silently swallow failures
`;

export function useRules(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rules(agentPath ?? ""),
    queryFn: async () => {
      try {
        return await tauriAgent.readFile(agentPath!, "rules.md");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not found|no such file/i.test(msg)) return DEFAULT_RULES;
        throw err;
      }
    },
    enabled: !!agentPath,
  });
}

export function useSaveRules(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => tauriAgent.writeFile(agentPath!, "rules.md", content),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.rules(agentPath) });
    },
  });
}
