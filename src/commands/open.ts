import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  getLastSessionId,
  getLatestSession,
  listSessions,
  loadSession,
} from "../capture/session";
import { renderPrText } from "../report/render";
import type { ReportDraft } from "../report/schema";
import { logEvent } from "../store/events";
import { reportHtmlPath, reportJsonPath } from "../store/paths";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const proc = Bun.spawn(["clip"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      proc.stdin.write(text);
      proc.stdin.end();
      return (await proc.exited) === 0;
    }
    if (process.platform === "darwin") {
      const proc = Bun.spawn(["pbcopy"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
      proc.stdin.write(text);
      proc.stdin.end();
      return (await proc.exited) === 0;
    }
    const proc = Bun.spawn(["xclip", "-selection", "clipboard"], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.stdin.write(text);
    proc.stdin.end();
    return (await proc.exited) === 0;
  } catch {
    return false;
  }
}

async function resolveSessionId(args: string[]): Promise<string | null> {
  const explicit = args.find((a) => !a.startsWith("-"));
  if (explicit) return explicit;
  const last = await getLastSessionId();
  if (last && existsSync(reportHtmlPath(last))) return last;
  const latest = await getLatestSession();
  return latest?.session_id ?? null;
}

async function loadDraft(sessionId: string): Promise<ReportDraft | null> {
  const path = reportJsonPath(sessionId);
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8")) as ReportDraft;
}

export async function runOpen(args: string[]): Promise<number> {
  if (args.includes("--list")) {
    const sessions = await listSessions();
    if (!sessions.length) {
      console.log("No hay sesiones.");
      return 0;
    }
    for (const s of sessions) {
      const hasReport = existsSync(reportHtmlPath(s.session_id)) ? "report" : "capture";
      const files = (s.diff?.files ?? s.touched_files).slice(0, 5).join(", ");
      console.log(
        [
          s.session_id,
          s.started_at,
          s.branch ?? "-",
          hasReport,
          files || "(sin archivos)",
        ].join("\t"),
      );
    }
    return 0;
  }

  const sessionId = await resolveSessionId(args);
  if (!sessionId) {
    console.error("No hay informes. Genera uno con una sesión de Claude Code o `agenttrust why`.");
    return 1;
  }

  if (args.includes("--pr")) {
    const draft = await loadDraft(sessionId);
    if (!draft) {
      console.error(`No hay borrador JSON para ${sessionId}. Prueba: agenttrust why ${sessionId}`);
      return 1;
    }
    const text = renderPrText(draft);
    await Bun.write(Bun.stdout, text.endsWith("\n") ? text : `${text}\n`);
    const copied = await copyToClipboard(text);
    console.error(copied ? "(copiado al portapapeles)" : "(portapapeles no disponible; texto en stdout)");
    await logEvent("pr_copied", { session_id: sessionId, prompt_version: draft.prompt_version });
    return 0;
  }

  const html = reportHtmlPath(sessionId);
  if (!existsSync(html)) {
    const session = await loadSession(sessionId);
    if (session) {
      console.error(`No hay HTML aún. Generando con agenttrust why…`);
      const { runWhy } = await import("./why");
      const code = await runWhy([sessionId]);
      if (code !== 0 || !existsSync(html)) return code;
    } else {
      console.error(`Informe no encontrado: ${html}`);
      return 1;
    }
  }

  const draft = await loadDraft(sessionId);
  await logEvent("draft_opened", {
    session_id: sessionId,
    prompt_version: draft?.prompt_version,
  });

  const proc = Bun.spawn({
    cmd:
      process.platform === "win32"
        ? ["cmd", "/c", "start", "", html]
        : process.platform === "darwin"
          ? ["open", html]
          : ["xdg-open", html],
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;
  console.log(`Abierto: ${html}`);
  return 0;
}
