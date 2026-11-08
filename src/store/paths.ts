import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export const AGENTRUST_HOME = join(homedir(), ".agenttrust");

export const PATHS = {
  home: AGENTRUST_HOME,
  sessions: join(AGENTRUST_HOME, "sessions"),
  reports: join(AGENTRUST_HOME, "reports"),
  events: join(AGENTRUST_HOME, "events.jsonl"),
  backups: join(AGENTRUST_HOME, "backups"),
  packs: join(AGENTRUST_HOME, "packs"),
  lastPackMarker: join(AGENTRUST_HOME, "last-pack.json"),
  meta: join(AGENTRUST_HOME, "meta.json"),
} as const;

export async function ensureStore(): Promise<void> {
  await mkdir(PATHS.sessions, { recursive: true });
  await mkdir(PATHS.reports, { recursive: true });
  await mkdir(PATHS.backups, { recursive: true });
  await mkdir(PATHS.packs, { recursive: true });
}

export function sessionPath(sessionId: string): string {
  return join(PATHS.sessions, `${sessionId}.json`);
}

export function reportJsonPath(sessionId: string): string {
  return join(PATHS.reports, `${sessionId}.json`);
}

export function reportHtmlPath(sessionId: string): string {
  return join(PATHS.reports, `${sessionId}.html`);
}
