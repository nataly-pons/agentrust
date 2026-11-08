import { GoogleGenAI } from "@google/genai";
import { writeFile } from "node:fs/promises";
import type { SessionCapture } from "../capture/session";
import { logEvent } from "../store/events";
import { ensureStore, reportHtmlPath, reportJsonPath } from "../store/paths";
import { buildUserPayload, loadSystemPrompt, PROMPT_VERSION } from "./prompt";
import { renderHtml } from "./render";
import {
  emptyReport,
  REPORT_JSON_SCHEMA,
  type Assumption,
  type Evidence,
  type FileChange,
  type ReportDraft,
} from "./schema";

const DEFAULT_MODEL = "gemini-2.5-flash";

function asEvidence(raw: unknown): Evidence {
  if (!raw || typeof raw !== "object") {
    return { kind: "no_declared_reason" };
  }
  const obj = raw as Record<string, unknown>;
  const kind = obj.kind;
  if (kind === "declared" || kind === "inferred" || kind === "no_declared_reason") {
    return {
      kind,
      citation: typeof obj.citation === "string" && obj.citation.trim() ? obj.citation : undefined,
    };
  }
  return { kind: "inferred" };
}

function normalizeDraft(raw: unknown, session: SessionCapture): ReportDraft {
  const base = emptyReport(session.session_id);
  base.branch = session.branch;
  base.cwd = session.cwd;
  base.asked = session.prompts.map((p) => p.prompt);
  base.prompt_version = PROMPT_VERSION;

  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;

  if (typeof obj.title === "string") base.title = obj.title;
  if (typeof obj.summary === "string") base.summary = obj.summary;
  if (typeof obj.pr_block === "string") base.pr_block = obj.pr_block;
  if (Array.isArray(obj.asked)) {
    base.asked = obj.asked.filter((x): x is string => typeof x === "string");
  }

  if (Array.isArray(obj.file_changes)) {
    base.file_changes = obj.file_changes
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map(
        (x): FileChange => ({
          path: String(x.path ?? ""),
          summary: String(x.summary ?? ""),
          why: String(x.why ?? ""),
          evidence: asEvidence(x.evidence),
          unrequested: Boolean(x.unrequested),
          no_trace: Boolean(x.no_trace),
        }),
      )
      .filter((x) => x.path);
  }

  if (Array.isArray(obj.assumptions)) {
    base.assumptions = obj.assumptions
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map(
        (x): Assumption => ({
          text: String(x.text ?? ""),
          evidence: asEvidence(x.evidence),
        }),
      )
      .filter((x) => x.text);
  }

  if (Array.isArray(obj.unrequested)) {
    base.unrequested = obj.unrequested
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        path: String(x.path ?? ""),
        detail: String(x.detail ?? ""),
        evidence: asEvidence(x.evidence),
      }))
      .filter((x) => x.path);
  }

  if (Array.isArray(obj.no_trace)) {
    base.no_trace = obj.no_trace
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x) => ({
        path: String(x.path ?? ""),
        detail: String(x.detail ?? ""),
      }))
      .filter((x) => x.path);
  }

  const known = new Set([
    ...base.file_changes.map((f) => f.path),
    ...base.no_trace.map((f) => f.path),
  ]);
  const allFiles = session.diff?.files ?? session.touched_files;
  for (const file of allFiles) {
    if (!known.has(file)) {
      base.no_trace.push({
        path: file,
        detail: "Aparece en el diff pero no hubo rastro claro en la sesión.",
      });
      base.file_changes.push({
        path: file,
        summary: "Cambio detectado en git sin rastro explícito en la sesión.",
        why: "no se encontró razón declarada",
        evidence: { kind: "no_declared_reason" },
        no_trace: true,
      });
    }
  }

  if (!base.pr_block) {
    base.pr_block = [
      `## AgentTrust — ${base.title}`,
      "",
      base.summary,
      "",
      "### Cambios",
      ...base.file_changes.map((f) => `- \`${f.path}\`: ${f.summary}`),
      "",
      base.assumptions.length
        ? `### Supuestos\n${base.assumptions.map((a) => `- ${a.text}`).join("\n")}`
        : "",
      base.unrequested.length
        ? `### Fuera de lo pedido\n${base.unrequested.map((u) => `- \`${u.path}\`: ${u.detail}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return base;
}

function fallbackDraft(session: SessionCapture, reason: string): ReportDraft {
  const draft = emptyReport(session.session_id);
  draft.branch = session.branch;
  draft.cwd = session.cwd;
  draft.asked = session.prompts.map((p) => p.prompt);
  draft.title = "Borrador parcial (sin modelo)";
  draft.summary = `No se pudo generar el informe con el modelo (${reason}). Se lista el diff capturado.`;
  const files = session.diff?.files ?? session.touched_files;
  draft.file_changes = files.map((path) => ({
    path,
    summary: "Archivo modificado durante la sesión.",
    why: "no se encontró razón declarada",
    evidence: { kind: "no_declared_reason" as const },
  }));
  draft.no_trace = files.map((path) => ({
    path,
    detail: "Pendiente de explicación automática.",
  }));
  draft.pr_block = [
    "## AgentTrust (borrador parcial)",
    "",
    draft.summary,
    "",
    "### Archivos",
    ...files.map((f) => `- \`${f}\``),
  ].join("\n");
  return draft;
}

export async function generateReport(session: SessionCapture): Promise<ReportDraft> {
  await ensureStore();
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  let draft: ReportDraft;

  if (!apiKey) {
    draft = fallbackDraft(session, "GEMINI_API_KEY ausente");
    await logEvent("draft_failed", {
      session_id: session.session_id,
      prompt_version: PROMPT_VERSION,
      detail: "missing_api_key",
    });
  } else {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const system = await loadSystemPrompt();
      const user = buildUserPayload(session);
      const model = process.env.AGENTTRUST_MODEL ?? DEFAULT_MODEL;

      const response = await ai.models.generateContent({
        model,
        contents: `${system}\n\n---\n\nSession data (JSON):\n${user}`,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: REPORT_JSON_SCHEMA,
        },
      });

      const text = response.text;
      if (!text?.trim()) {
        throw new Error("Empty response from Gemini");
      }
      const parsed = JSON.parse(text) as unknown;
      draft = normalizeDraft(parsed, session);
      await logEvent("draft_generated", {
        session_id: session.session_id,
        prompt_version: PROMPT_VERSION,
        detail: model,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      draft = fallbackDraft(session, message);
      await logEvent("draft_failed", {
        session_id: session.session_id,
        prompt_version: PROMPT_VERSION,
        detail: message.slice(0, 200),
      });
    }
  }

  await writeFile(reportJsonPath(session.session_id), JSON.stringify(draft, null, 2), "utf8");
  await writeFile(reportHtmlPath(session.session_id), renderHtml(draft), "utf8");
  return draft;
}
