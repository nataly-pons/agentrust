import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  mergeAgentTrustHooks,
  resolveAgenttrustCommand,
  userSettingsPath,
} from "../hooks/claudeSettings";
import { logEvent } from "../store/events";
import { ensureStore } from "../store/paths";

export async function runInit(args: string[]): Promise<number> {
  await ensureStore();
  const useProject = args.includes("--project");
  const settingsPath = useProject
    ? join(process.cwd(), ".claude", "settings.json")
    : userSettingsPath();

  const claudeDir = join(homedir(), ".claude");
  if (!useProject && !existsSync(claudeDir)) {
    console.log("No se encontró ~/.claude. Se creará settings.json para Claude Code.");
  }

  const baseCmd = await resolveAgenttrustCommand();
  const result = await mergeAgentTrustHooks(settingsPath, baseCmd);
  await logEvent("init", { detail: result.settingsPath });

  console.log("AgentTrust instalado.");
  console.log(`  Settings: ${result.settingsPath}`);
  console.log(`  Backup:   ${result.backupPath}`);
  console.log(`  Hook cmd: ${baseCmd} hook <event>`);
  console.log("");
  console.log("Siguiente paso: abre Claude Code y trabaja con normalidad.");
  console.log("Al cerrar la sesión verás: Borrador listo · agenttrust open");
  return 0;
}
