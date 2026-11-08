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

const evidenceSchema = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["declared", "inferred", "no_declared_reason"],
      description: "declared = quote exists; inferred = guess; no_declared_reason = none",
    },
    citation: {
      type: "string",
      description: "Exact quote from prompts/tools when kind is declared; empty otherwise",
    },
  },
  required: ["kind", "citation"],
  additionalProperties: false,
} as const;

/** JSON Schema for Gemini structured outputs (responseJsonSchema). */
export const REPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short report title" },
    summary: { type: "string", description: "Executive summary answering why changes happened" },
    pr_block: { type: "string", description: "Markdown block ready to paste into a PR" },
    asked: {
      type: "array",
      items: { type: "string" },
      description: "User prompts, shortened",
    },
    file_changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          summary: { type: "string" },
          why: { type: "string" },
          evidence: evidenceSchema,
          unrequested: { type: "boolean" },
          no_trace: { type: "boolean" },
        },
        required: ["path", "summary", "why", "evidence", "unrequested", "no_trace"],
        additionalProperties: false,
      },
    },
    assumptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          evidence: evidenceSchema,
        },
        required: ["text", "evidence"],
        additionalProperties: false,
      },
    },
    unrequested: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          detail: { type: "string" },
          evidence: evidenceSchema,
        },
        required: ["path", "detail", "evidence"],
        additionalProperties: false,
      },
    },
    no_trace: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          detail: { type: "string" },
        },
        required: ["path", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "title",
    "summary",
    "pr_block",
    "asked",
    "file_changes",
    "assumptions",
    "unrequested",
    "no_trace",
  ],
  additionalProperties: false,
} as const;
