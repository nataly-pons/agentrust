#!/usr/bin/env bun
import { runHook } from "./commands/hook";
import { runInit } from "./commands/init";
import { runOpen } from "./commands/open";
import { runPack } from "./commands/pack";
import { runUninstall } from "./commands/uninstall";
import { runWhy } from "./commands/why";

const HELP = `AgentTrust — responde por cada cambio que hizo tu agente.

Uso:
  agenttrust init [--project]   Conecta hooks a Claude Code
  agenttrust why [session]      Genera / regenera el informe
  agenttrust open [--list|--pr] [session]
  agenttrust uninstall          Restaura la configuración
  agenttrust pack [--exclude id...]
  agenttrust hook <event>       (interno, lo llama Claude Code)

Almacenamiento local: ~/.agenttrust/
`;

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;

  let code = 0;
  switch (cmd) {
    case "init":
      code = await runInit(args);
      break;
    case "why":
      code = await runWhy(args);
      break;
    case "open":
      code = await runOpen(args);
      break;
    case "uninstall":
      code = await runUninstall();
      break;
    case "pack":
      code = await runPack(args);
      break;
    case "hook":
      code = await runHook(args);
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      code = cmd ? 0 : 0;
      break;
    case "version":
    case "--version":
    case "-v":
      console.log("agenttrust 0.1.0");
      break;
    default:
      console.error(`Comando desconocido: ${cmd}\n`);
      console.log(HELP);
      code = 1;
  }

  process.exit(code);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
