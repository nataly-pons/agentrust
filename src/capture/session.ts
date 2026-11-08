import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureStore, PATHS, sessionPath } from "../store/paths";
import { redactObject, redactText } from "./redact";
import type { GitBaseline, GitDiffResult } from "./git";

export interface PromptEntry {
  ts: string;
  prompt: string;
}

export interface ToolEntry {
  ts: string;
  tool_name: string;
  input?: unknown;
  files?: string[];
  summary?: string;
}

export interface SessionCapture {
  session_id: string;
  cwd: string;
  started_at: string;
  updated_at: string;
  ended_at?: string;
  branch?: string;
  baseline: GitBaseline;
  prompts: PromptEntry[];
  tools: ToolEntry[];
  touched_files: string[];
  diff?: GitDiffResult;
  transcript_path?: string;
}

export async function loadSession(sessionId: string): Promise<SessionCapture | null> {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as SessionCapture;
}

export async function saveSession(session: SessionCapture): Promise<void> {
  await ensureStore();
  session.updated_at = new Date().toISOString();
  await writeFile(sessionPath(session.session_id), JSON.stringify(session, null, 2), "utf8");
}

export async function createSession(params: {
  sessionId: string;
  cwd: string;
  baseline: GitBaseline;
  transcriptPath?: string;
}): Promise<SessionCapture> {
  const session: SessionCapture = {
    session_id: params.sessionId,
    cwd: params.cwd,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    branch: params.baseline.branch,
    baseline: params.baseline,
    prompts: [],
    tools: [],
    touched_files: [],
    transcript_path: params.transcriptPath,
  };
  await saveSession(session);
  return session;
}

export async function appendPrompt(sessionId: string, prompt: string): Promise<SessionCapture | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;
  session.prompts.push({
    ts: new Date().toISOString(),
    prompt: redactText(prompt),
  });
  await saveSession(session);
  return session;
}

function extractFilesFromTool(toolName: string, input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const obj = input as Record<string, unknown>;
  const files: string[] = [];
  for (const key of ["file_path", "filePath", "path", "notebook_path"]) {
    if (typeof obj[key] === "string") files.push(obj[key] as string);
  }
  if (Array.isArray(obj.file_paths)) {
    for (const p of obj.file_paths) {
      if (typeof p === "string") files.push(p);
    }
  }
  if (toolName === "Bash" && typeof obj.command === "string") {
    // best-effort: ignore for path extraction
  }
  return files;
}

export async function appendTool(
  sessionId: string,
  toolName: string,
  input: unknown,
  summary?: string,
): Promise<SessionCapture | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;
  const files = extractFilesFromTool(toolName, input);
  const safeInput = redactObject(input);
  session.tools.push({
    ts: new Date().toISOString(),
    tool_name: toolName,
    input: safeInput,
    files,
    summary: summary ? redactText(summary).slice(0, 2000) : undefined,
  });
  session.touched_files = [...new Set([...session.touched_files, ...files])];
  await saveSession(session);
  return session;
}

export async function finalizeSession(
  sessionId: string,
  diff: GitDiffResult,
): Promise<SessionCapture | null> {
  const session = await loadSession(sessionId);
  if (!session) return null;
  session.diff = diff;
  session.ended_at = new Date().toISOString();
  if (diff.files.length) {
    session.touched_files = [...new Set([...session.touched_files, ...diff.files])];
  }
  await saveSession(session);
  return session;
}

export async function listSessions(): Promise<SessionCapture[]> {
  await ensureStore();
  const glob = new Bun.Glob("*.json");
  const sessions: SessionCapture[] = [];
  for await (const file of glob.scan({ cwd: PATHS.sessions })) {
    try {
      const data = JSON.parse(
        await readFile(sessionPath(file.replace(/\.json$/, "")), "utf8"),
      ) as SessionCapture;
      sessions.push(data);
    } catch {
      // skip corrupt
    }
  }
  return sessions.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export async function getLatestSession(): Promise<SessionCapture | null> {
  const sessions = await listSessions();
  return sessions[0] ?? null;
}

export async function setLastSessionId(sessionId: string): Promise<void> {
  await ensureStore();
  let meta: Record<string, unknown> = {};
  if (existsSync(PATHS.meta)) {
    try {
      meta = JSON.parse(await readFile(PATHS.meta, "utf8"));
    } catch {
      meta = {};
    }
  }
  meta.last_session_id = sessionId;
  await writeFile(PATHS.meta, JSON.stringify(meta, null, 2), "utf8");
}

export async function getLastSessionId(): Promise<string | null> {
  if (!existsSync(PATHS.meta)) return null;
  try {
    const meta = JSON.parse(await readFile(PATHS.meta, "utf8")) as { last_session_id?: string };
    return meta.last_session_id ?? null;
  } catch {
    return null;
  }
}
