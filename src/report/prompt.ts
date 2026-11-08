import { join } from "node:path";
import { PROMPT_VERSION } from "./schema";
import type { SessionCapture } from "../capture/session";

export { PROMPT_VERSION };

/** Embedded copy of prompts/report-v1.md (kept in sync for compiled binary). */
export const EMBEDDED_SYSTEM_PROMPT = `# AgentTrust report prompt — v1

You write an accountability report for a developer who delegated work to Claude Code and must answer: «¿por qué se hizo este cambio?»

## Inputs you receive
- User prompts from the session (\`asked\`)
- Tool calls and touched files
- The real git diff vs session start (source of truth for what changed)

## Required output
Return **only** a JSON object with:
- \`title\`, \`summary\`, \`pr_block\`
- \`asked\` (echo the user asks, shortened)
- \`file_changes[]\`: every changed file with \`summary\`, \`why\`, \`evidence\`
- \`assumptions[]\`: unspoken assumptions the agent made
- \`unrequested[]\`: changes outside what was asked
- \`no_trace[]\`: files that appear in the diff but have no tool/prompt trail

## Evidence rules (critical)
- \`declared\`: the reason was explicitly said in a prompt or tool trail. \`citation\` must quote that text.
- \`inferred\`: reasonable inference from the diff; never mark as declared.
- \`no_declared_reason\`: no supporting quote exists.
- Never invent citations.
- Never mark a guessed reason as \`declared\`.

## Coverage rules
- 100% of files in \`changed_files\` / the diff must appear in \`file_changes\` or \`no_trace\`.
- Prefer Spanish for \`summary\`, \`why\`, \`pr_block\`, and assumption text when the user prompts are in Spanish; otherwise match the user's language.

## Style
- Be concise and concrete. Ready to paste into a PR or reply to a tech lead.
- Do not include secrets, tokens, or full transcripts.
`;

export async function loadSystemPrompt(): Promise<string> {
  const candidates = [
    join(import.meta.dir, "../../prompts/report-v1.md"),
    join(process.cwd(), "prompts/report-v1.md"),
  ];
  for (const path of candidates) {
    try {
      const text = await Bun.file(path).text();
      if (text.trim()) return text;
    } catch {
      // try next
    }
  }
  return EMBEDDED_SYSTEM_PROMPT;
}

export function buildUserPayload(session: SessionCapture): string {
  const asked = session.prompts.map((p) => p.prompt);
  const tools = session.tools.map((t) => ({
    tool: t.tool_name,
    files: t.files,
    input: t.input,
    summary: t.summary,
  }));
  const diff = session.diff?.unifiedDiff ?? "";
  const files = session.diff?.files ?? session.touched_files;
  const truncatedDiff =
    diff.length > 80_000 ? `${diff.slice(0, 80_000)}\n…[diff truncated]` : diff;

  return JSON.stringify(
    {
      session_id: session.session_id,
      cwd: session.cwd,
      branch: session.branch,
      asked,
      tools,
      changed_files: files,
      git_status: session.diff?.status ?? "",
      unified_diff: truncatedDiff,
      output_schema: {
        title: "string",
        summary: "string",
        pr_block: "string (markdown ready to paste in a PR)",
        asked: ["string"],
        file_changes: [
          {
            path: "string",
            summary: "string",
            why: "string",
            evidence: { kind: "declared|inferred|no_declared_reason", citation: "optional string" },
            unrequested: "boolean optional",
            no_trace: "boolean optional",
          },
        ],
        assumptions: [
          {
            text: "string",
            evidence: { kind: "declared|inferred|no_declared_reason", citation: "optional" },
          },
        ],
        unrequested: [{ path: "string", detail: "string", evidence: { kind: "…", citation: "…" } }],
        no_trace: [{ path: "string", detail: "string" }],
      },
    },
    null,
    2,
  );
}
