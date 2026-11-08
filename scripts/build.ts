import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const outDir = join(import.meta.dir, "../dist");
await mkdir(outDir, { recursive: true });

const outfile =
  process.platform === "win32"
    ? join(outDir, "agenttrust.exe")
    : join(outDir, "agenttrust");

const result = Bun.spawnSync([
  "bun",
  "build",
  "--compile",
  join(import.meta.dir, "../src/cli.ts"),
  "--outfile",
  outfile,
]);

if (result.exitCode !== 0) {
  console.error(result.stderr.toString() || "build failed");
  process.exit(result.exitCode ?? 1);
}

console.log(`Built ${outfile}`);
