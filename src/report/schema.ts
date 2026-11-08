export const PROMPT_VERSION = "v1";

export type EvidenceKind = "declared" | "inferred" | "no_declared_reason";

export interface Evidence {
  kind: EvidenceKind;
  citation?: string;
}

export interface FileChange {
  path: string;
  summary: string;
  why: string;
  evidence: Evidence;
  unrequested?: boolean;
  no_trace?: boolean;
}

export interface Assumption {
  text: string;
  evidence: Evidence;
}

export interface ReportDraft {
  prompt_version: string;
  session_id: string;
  generated_at: string;
  branch?: string;
  cwd?: string;
  title: string;
  summary: string;
  pr_block: string;
  file_changes: FileChange[];
  assumptions: Assumption[];
  unrequested: Array<{ path: string; detail: string; evidence: Evidence }>;
  no_trace: Array<{ path: string; detail: string }>;
  asked: string[];
}

export function emptyReport(sessionId: string): ReportDraft {
  return {
    prompt_version: PROMPT_VERSION,
    session_id: sessionId,
    generated_at: new Date().toISOString(),
    title: "Session report",
    summary: "",
    pr_block: "",
    file_changes: [],
    assumptions: [],
    unrequested: [],
    no_trace: [],
    asked: [],
  };
}
