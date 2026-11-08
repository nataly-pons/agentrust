import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { PATHS, ensureStore } from "../store/paths";

export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PostToolUse"
  | "SessionEnd";

interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
  async?: boolean;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookCommand[];
}

export interface ClaudeSettings {
  hooks?: Partial<Record<HookEventName | string, HookMatcher[]>>;
  [key: string]: unknown;
}

const AGENTTRUST_MARKER = "agenttrust hook";

export function userSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function projectSettingsPath(cwd = process.cwd()): string {
  return join(cwd, ".claude", "settings.json");
}

export async function resolveAgenttrustCommand(): Promise<string> {
  // Prefer compiled binary on PATH, else bun run from this package
  const exeName = process.platform === "win32" ? "agenttrust.exe" : "agenttrust";
  const compiled = join(process.cwd(), "dist", exeName);
  if (existsSync(compiled)) {
    return `"${compiled}"`;
  }
  // If this process is already the compiled binary, use argv0
  if (process.execPath && /agenttrust/i.test(process.execPath)) {
    return `"${process.execPath}"`;
  }
  const entry = join(import.meta.dir, "../cli.ts");
  if (existsSync(entry)) {
    return `bun "${entry}"`;
  }
  return "agenttrust";
}

const HOOK_MARKER = "agenttrust-hook";

function hookCommand(base: string, event: HookEventName): HookCommand {
  // Marker keeps uninstall reliable even when the path contains "agentrust".
  const cmd = `${base} hook ${event} # ${HOOK_MARKER}`;
  if (event === "SessionEnd") {
    return { type: "command", command: cmd, async: true, timeout: 60 };
  }
  if (event === "PostToolUse" || event === "UserPromptSubmit") {
    return { type: "command", command: cmd, timeout: 15 };
  }
  return { type: "command", command: cmd, timeout: 30 };
}

function isAgentTrustHook(command: string | undefined): boolean {
  if (!command) return false;
  return command.includes(HOOK_MARKER) || /agenttrust(\.exe)?["']?\s+hook\s+/i.test(command);
}

export function stripAgentTrustHooks(settings: ClaudeSettings): ClaudeSettings {
  const hooks = { ...(settings.hooks ?? {}) };
  for (const event of Object.keys(hooks)) {
    const matchers = hooks[event];
    if (!Array.isArray(matchers)) continue;
    const cleaned = matchers
      .map((matcher) => ({
        ...matcher,
        hooks: (matcher.hooks ?? []).filter((h) => !isAgentTrustHook(h.command)),
      }))
      .filter((matcher) => matcher.hooks.length > 0);
    if (cleaned.length) hooks[event] = cleaned;
    else delete hooks[event];
  }
  return { ...settings, hooks };
}

export async function mergeAgentTrustHooks(
  settingsPath: string,
  baseCmd: string,
): Promise<{ backupPath: string; settingsPath: string }> {
  await ensureStore();
  await mkdir(dirname(settingsPath), { recursive: true });

  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    const raw = await readFile(settingsPath, "utf8");
    settings = raw.trim() ? (JSON.parse(raw) as ClaudeSettings) : {};
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(PATHS.backups, `settings-${stamp}.json`);
  if (existsSync(settingsPath)) {
    await copyFile(settingsPath, backupPath);
  } else {
    await writeFile(backupPath, "{}", "utf8");
  }
  await writeFile(
    join(PATHS.backups, "latest-settings-path.txt"),
    `${settingsPath}\n${backupPath}\n`,
    "utf8",
  );

  const cleaned = stripAgentTrustHooks(settings);
  const hooks = { ...(cleaned.hooks ?? {}) };

  const events: HookEventName[] = [
    "SessionStart",
    "UserPromptSubmit",
    "PostToolUse",
    "SessionEnd",
  ];

  for (const event of events) {
    const entry: HookMatcher = {
      hooks: [hookCommand(baseCmd, event)],
    };
    // PostToolUse: match all tools (omit matcher)
    // SessionStart/SessionEnd: omit matcher to catch all
    const existing = hooks[event] ?? [];
    hooks[event] = [...existing, entry];
  }

  const next: ClaudeSettings = {
    ...cleaned,
    hooks,
  };

  // Keep a comment-like marker in a custom field for humans
  next.agenttrust = {
    installed: true,
    marker: AGENTTRUST_MARKER,
    installed_at: new Date().toISOString(),
  };

  await writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { backupPath, settingsPath };
}

export async function restoreFromBackup(): Promise<{ settingsPath: string; backupPath: string }> {
  const latest = join(PATHS.backups, "latest-settings-path.txt");
  if (!existsSync(latest)) {
    throw new Error("No hay backup de AgentTrust. ¿Se ejecutó agenttrust init?");
  }
  const [settingsPath, backupPath] = (await readFile(latest, "utf8")).trim().split("\n");
  if (!settingsPath || !backupPath || !existsSync(backupPath)) {
    throw new Error("Backup de settings no encontrado.");
  }

  const backupRaw = await readFile(backupPath, "utf8");
  const backupEmpty = !backupRaw.trim() || backupRaw.trim() === "{}";

  if (backupEmpty) {
    if (existsSync(settingsPath)) {
      const current = JSON.parse(await readFile(settingsPath, "utf8")) as ClaudeSettings;
      const stripped = stripAgentTrustHooks(current);
      delete stripped.agenttrust;
      if (!stripped.hooks || Object.keys(stripped.hooks).length === 0) {
        delete stripped.hooks;
      }
      const keys = Object.keys(stripped).filter((k) => k !== "hooks" || stripped.hooks);
      if (keys.length === 0 || (keys.length === 1 && stripped.hooks === undefined)) {
        await writeFile(settingsPath, "{}\n", "utf8");
      } else {
        await writeFile(settingsPath, `${JSON.stringify(stripped, null, 2)}\n`, "utf8");
      }
    }
  } else {
    const backup = JSON.parse(backupRaw) as ClaudeSettings;
    const cleaned = stripAgentTrustHooks(backup);
    delete cleaned.agenttrust;
    await writeFile(settingsPath, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
  }

  return { settingsPath, backupPath };
}
