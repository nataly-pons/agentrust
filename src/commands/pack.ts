import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { listSessions } from "../capture/session";
import { logEvent } from "../store/events";
import { ensureStore, PATHS, reportHtmlPath, reportJsonPath, sessionPath } from "../store/paths";
import { redactText } from "../capture/redact";

interface PackMarker {
  last_pack_at: string;
  packed_sessions: string[];
}

async function loadMarker(): Promise<PackMarker> {
  if (!existsSync(PATHS.lastPackMarker)) {
    return { last_pack_at: "1970-01-01T00:00:00.000Z", packed_sessions: [] };
  }
  return JSON.parse(await readFile(PATHS.lastPackMarker, "utf8")) as PackMarker;
}

export async function runPack(args: string[]): Promise<number> {
  await ensureStore();
  await mkdir(PATHS.packs, { recursive: true });

  const excludeIdx = args.indexOf("--exclude");
  const excluded = new Set<string>();
  if (excludeIdx !== -1) {
    for (let i = excludeIdx + 1; i < args.length; i++) {
      if (args[i].startsWith("-")) break;
      excluded.add(args[i]);
    }
  }

  const marker = await loadMarker();
  const sessions = await listSessions();
  const pending = sessions.filter(
    (s) =>
      !excluded.has(s.session_id) &&
      s.started_at >= marker.last_pack_at &&
      !marker.packed_sessions.includes(s.session_id),
  );

  // Also include any session newer than last pack by ended_at
  const pendingIds = new Set(pending.map((s) => s.session_id));
  for (const s of sessions) {
    if (excluded.has(s.session_id)) continue;
    if (marker.packed_sessions.includes(s.session_id)) continue;
    if (s.ended_at && s.ended_at >= marker.last_pack_at) pendingIds.add(s.session_id);
    if (!marker.packed_sessions.length && !pendingIds.has(s.session_id)) {
      // first pack: take all
      pendingIds.add(s.session_id);
    }
  }

  if (!pendingIds.size) {
    console.log("No hay nada nuevo que empaquetar desde el último envío.");
    return 0;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipPath = join(PATHS.packs, `agenttrust-pack-${stamp}.zip`);
  const staging = join(PATHS.packs, `staging-${stamp}`);
  await mkdir(staging, { recursive: true });

  const packed: string[] = [];
  for (const id of pendingIds) {
    const files = [
      sessionPath(id),
      reportJsonPath(id),
      reportHtmlPath(id),
    ];
    for (const file of files) {
      if (!existsSync(file)) continue;
      let content = await readFile(file, "utf8");
      content = redactText(content);
      await writeFile(join(staging, basename(file)), content, "utf8");
    }
    packed.push(id);
  }

  // Copy events (redacted — events shouldn't have content, but just in case)
  if (existsSync(PATHS.events)) {
    const events = redactText(await readFile(PATHS.events, "utf8"));
    await writeFile(join(staging, "events.jsonl"), events, "utf8");
  }

  // Zip via PowerShell Compress-Archive on Windows, zip elsewhere
  if (process.platform === "win32") {
    const ps = Bun.spawn([
      "powershell",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path "${staging}\\*" -DestinationPath "${zipPath}" -Force`,
    ]);
    const code = await ps.exited;
    if (code !== 0) {
      console.error("No se pudo crear el ZIP.");
      return 1;
    }
  } else {
    const zip = Bun.spawn(["zip", "-r", zipPath, "."], { cwd: staging });
    const code = await zip.exited;
    if (code !== 0) {
      console.error("No se pudo crear el ZIP (¿está instalado zip?).");
      return 1;
    }
  }

  const nextMarker: PackMarker = {
    last_pack_at: new Date().toISOString(),
    packed_sessions: [...new Set([...marker.packed_sessions, ...packed])],
  };
  await writeFile(PATHS.lastPackMarker, JSON.stringify(nextMarker, null, 2), "utf8");
  await logEvent("pack", { detail: `${packed.length} sessions → ${zipPath}` });

  console.log(`Paquete listo: ${zipPath}`);
  console.log(`Sesiones: ${packed.join(", ")}`);
  return 0;
}
