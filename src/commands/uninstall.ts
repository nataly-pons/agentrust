import { restoreFromBackup } from "../hooks/claudeSettings";
import { logEvent } from "../store/events";

export async function runUninstall(): Promise<number> {
  try {
    const result = await restoreFromBackup();
    await logEvent("uninstall", { detail: result.settingsPath });
    console.log("AgentTrust desinstalado. Configuración restaurada.");
    console.log(`  Settings: ${result.settingsPath}`);
    console.log(`  Desde:    ${result.backupPath}`);
    console.log("Los informes en ~/.agenttrust se conservan.");
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}
