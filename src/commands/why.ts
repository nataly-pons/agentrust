import { existsSync } from "node:fs";
import { diffAgainstBaseline } from "../capture/git";
import {
  finalizeSession,
  getLastSessionId,
  getLatestSession,
  loadSession,
} from "../capture/session";
import { generateReport } from "../report/generate";
import { reportHtmlPath } from "../store/paths";

export async function runWhy(args: string[]): Promise<number> {
  const sessionIdArg = args.find((a) => !a.startsWith("-"));
  let session = sessionIdArg ? await loadSession(sessionIdArg) : null;

  if (!session) {
    const lastId = await getLastSessionId();
    if (lastId) session = await loadSession(lastId);
  }
  if (!session) session = await getLatestSession();

  if (!session) {
    console.error("No hay sesiones capturadas. Usa Claude Code después de `agenttrust init`.");
    return 1;
  }

  // Refresh diff when the working tree still exists; keep captured diff for fixtures/offline.
  if (existsSync(session.cwd) && session.baseline.available) {
    const diff = await diffAgainstBaseline(session.cwd, session.baseline);
    if (diff.available && (diff.files.length > 0 || !session.diff?.files?.length)) {
      session = (await finalizeSession(session.session_id, diff)) ?? session;
    }
  }

  console.log(`Generando informe para sesión ${session.session_id}…`);
  const draft = await generateReport(session);
  const html = reportHtmlPath(session.session_id);
  console.log(`Listo: ${draft.title}`);
  console.log(`HTML: ${html}`);
  console.log(`JSON: ${html.replace(/\.html$/, ".json")}`);
  if (existsSync(html)) {
    console.log("Ábrelo con: agenttrust open");
  }
  return 0;
}
