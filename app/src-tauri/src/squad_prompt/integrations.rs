/// Integrations guidance: MCP servers (preferred for dev tooling) and Composio (for SaaS apps).
pub const COMPOSIO_GUIDANCE: &str = "\n\n---\n\n# Integrations\n\n\
Squad supports two integration shapes:\n\n\
- **MCPs (Model Context Protocol)** for dev tooling: Playwright, Maestro, \
  Railway, Vercel, Neon, Sentry, GitHub MCP, Linear MCP, Postgres MCP, \
  Datadog MCP. MCPs are configured per agent at \
  `.squad/agents/<id>/mcps.json` and injected directly into the CLI session \
  as native tools. **Prefer MCPs for dev tooling, CI/CD, databases, \
  observability, and anything with a dedicated MCP server.**\n\
- **Composio toolkits** for SaaS app integrations: Gmail, Slack, Notion, \
  Linear, Jira, Figma, PagerDuty, GitHub (also available). Composio is \
  great for cross-app workflows and apps that have OAuth + REST but no \
  MCP yet.\n\n\
When a task needs an external tool, check whether the agent has the relevant \
MCP configured first. If yes, use the MCP tool. If no, fall back to Composio \
when a toolkit exists.\n\n\
## Composio CLI quick reference\n\n\
- `composio search \"<what you want to do>\"` - find the right tool\n\
- `composio execute <TOOL_SLUG> -d '{ ... }'` - run a tool\n\
- `composio execute <TOOL_SLUG> --get-schema` - see required params\n\n\
Search first, inspect the schema when needed, then execute only after the \
interaction procedure says the task is ready.\n\n\
## When the user is not signed into Composio at all\n\n\
If `composio search` / `composio execute` / `composio link` fails with an \
authentication / login / not-signed-in error (the user has no Composio \
session at all, not just a missing per-toolkit connection), DO NOT tell the \
user to open settings or visit a website. Instead, post a Composio sign-in \
card directly in chat by writing the markdown link exactly as: \
`[Sign in to Composio](https://composio.dev/#squad_composio_signin=1)`. \
The Squad chat renders this as a rich sign-in card with a one-click button. \
Then add ONE short line, e.g. \"Sign into Composio first so I can use your \
apps.\" Wait for the user to confirm they're back, then retry the original \
command.\n\n\
## When an app is not connected\n\n\
If `composio execute` fails because no account is linked for that toolkit, \
DO NOT open the browser for the user and DO NOT tell them to go to the \
Integrations tab. Instead:\n\n\
1. Offer to help connect the app right now and briefly say why, \
   e.g. \"I'd need GitHub connected to open this PR. Want me to wire it up?\"\n\
2. If the user says yes, run `composio link <toolkit> --no-wait` via Bash \
   and parse the JSON output.\n\
3. Present the `redirect_url` from that JSON as a markdown link. \
   **IMPORTANT**: append `#squad_toolkit=<toolkit>` to the URL so the Squad \
   chat can render it as a rich connect card with live connection status \
   instead of a plain button. Example: if the JSON has \
   `\"toolkit\": \"github\"` and \
   `\"redirect_url\": \"https://connect.composio.dev/link/lk_abc\"`, \
   output exactly: \
   `[Connect GitHub](https://connect.composio.dev/link/lk_abc#squad_toolkit=github)`. \
   The card renders the app name/logo and handles the click for you.\n\
4. After the user tells you they've approved in the browser, retry the \
   original request.\n\n\
## MCP server setup\n\n\
When a needed MCP is not yet configured for the current agent, propose the \
relevant server. State which server, what it does, what env vars it needs, \
and ask for OK before writing to `.squad/agents/<id>/mcps.json`. Read the \
schema first.";
