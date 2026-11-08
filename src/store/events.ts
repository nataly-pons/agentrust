import { appendFile } from "node:fs/promises";
import { ensureStore, PATHS } from "./paths";

export type EventType =
  | "session_captured"
  | "draft_generated"
  | "draft_opened"
  | "pr_copied"
  | "marked_file_edited_after"
  | "draft_failed"
  | "init"
  | "uninstall"
  | "pack";

export interface AgentTrustEvent {
  type: EventType;
  ts: string;
  session_id?: string;
  prompt_version?: string;
  detail?: string;
}

export async function logEvent(
  type: EventType,
  fields: Omit<AgentTrustEvent, "type" | "ts"> = {},
): Promise<void> {
  await ensureStore();
  const event: AgentTrustEvent = {
    type,
    ts: new Date().toISOString(),
    ...fields,
  };
  await appendFile(PATHS.events, `${JSON.stringify(event)}\n`, "utf8");
}
