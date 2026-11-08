import { captureBaseline, diffAgainstBaseline } from "../capture/git";
import {
  appendPrompt,
  appendTool,
  createSession,
  finalizeSession,
  loadSession,
  setLastSessionId,
} from "../capture/session";
import { generateReport } from "../report/generate";
import { logEvent } from "../store/events";
import { ensureStore } from "../store/paths";

interface HookPayload {
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  hook_event_name?: string;
  [key: string]: unknown;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sessionIdFrom(payload: HookPayload): string {
  if (payload.session_id && typeof payload.session_id === "string") {
    return payload.session_id;
  }
  return `local-${Date.now()}`;
}

export async function runHook(args: string[]): Promise<number> {
  await ensureStore();
  const raw = await readStdin();
  let payload: HookPayload = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as HookPayload;
    } catch {
      // ignore malformed
    }
  }

  // Ignore trailing "# agenttrust-hook" marker from settings command lines.
  const event = args.find((a) => !a.startsWith("#")) || payload.hook_event_name || "";
  const sessionId = sessionIdFrom(payload);
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();

  try {
    if (event === "SessionStart") {
      const baseline = await captureBaseline(cwd);
      await createSession({
        sessionId,
        cwd,
        baseline,
        transcriptPath: typeof payload.transcript_path === "string" ? payload.transcript_path : undefined,
      });
      await setLastSessionId(sessionId);
      await logEvent("session_captured", { session_id: sessionId });
      return 0;
    }

    if (event === "UserPromptSubmit") {
      const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
      let session = await loadSession(sessionId);
      if (!session) {
        const baseline = await captureBaseline(cwd);
        session = await createSession({ sessionId, cwd, baseline });
        await setLastSessionId(sessionId);
      }
      await appendPrompt(sessionId, prompt);
      return 0;
    }

    if (event === "PostToolUse") {
      const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "Unknown";
      let session = await loadSession(sessionId);
      if (!session) {
        const baseline = await captureBaseline(cwd);
        session = await createSession({ sessionId, cwd, baseline });
        await setLastSessionId(sessionId);
      }
      const summary =
        typeof payload.tool_response === "string"
          ? payload.tool_response
          : payload.tool_response
            ? JSON.stringify(payload.tool_response).slice(0, 2000)
            : undefined;
      await appendTool(sessionId, toolName, payload.tool_input, summary);
      return 0;
    }

    if (event === "SessionEnd") {
      let session = await loadSession(sessionId);
      if (!session) {
        // Nothing captured; exit quietly
        return 0;
      }
      const diff = await diffAgainstBaseline(session.cwd, session.baseline);
      session = (await finalizeSession(sessionId, diff)) ?? session;
      await setLastSessionId(sessionId);
      await generateReport(session);
      // Print to stderr so Claude Code surfaces it to the user without treating as JSON
      console.error("Borrador listo · agenttrust open");
      return 0;
    }

    // Unknown event: no-op
    return 0;
  } catch (err) {
    console.error(
      `agenttrust hook error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0; // never block Claude Code
  }
}
