export interface GitBaseline {
  available: boolean;
  cwd: string;
  head?: string;
  branch?: string;
  status?: string;
  treeHash?: string;
  error?: string;
}

export interface GitDiffResult {
  available: boolean;
  files: string[];
  unifiedDiff: string;
  status: string;
  error?: string;
}

async function runGit(cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    return { ok: code === 0, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
  } catch (err) {
    return { ok: false, stdout: "", stderr: err instanceof Error ? err.message : String(err) };
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.stdout.trim() === "true";
}

export async function captureBaseline(cwd: string): Promise<GitBaseline> {
  const inside = await isGitRepo(cwd);
  if (!inside) {
    return { available: false, cwd, error: "not_a_git_repo" };
  }

  const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d6927f259f8068";

  const [head, branch, status, tree] = await Promise.all([
    runGit(cwd, ["rev-parse", "HEAD"]),
    runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(cwd, ["status", "--porcelain"]),
    runGit(cwd, ["write-tree"]),
  ]);

  // Prefer write-tree (current index). Fall back to the well-known empty tree
  // so unborn HEAD repos (no commits yet) still get a usable baseline.
  const treeHash = tree.ok ? tree.stdout.trim() : EMPTY_TREE;

  return {
    available: true,
    cwd,
    head: head.ok ? head.stdout.trim() : undefined,
    branch: branch.ok && branch.stdout.trim() !== "HEAD" ? branch.stdout.trim() : undefined,
    status: status.ok ? status.stdout : undefined,
    treeHash,
    error: undefined,
  };
}

export async function diffAgainstBaseline(
  cwd: string,
  baseline: GitBaseline,
): Promise<GitDiffResult> {
  if (!baseline.available) {
    return { available: false, files: [], unifiedDiff: "", status: "", error: baseline.error };
  }

  const status = await runGit(cwd, ["status", "--porcelain"]);
  const filesFromStatus = status.ok
    ? status.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.slice(3).trim().replace(/^.* -> /, ""))
    : [];

  let unifiedDiff = "";
  let files: string[] = [...filesFromStatus];

  if (baseline.treeHash) {
    const diff = await runGit(cwd, ["diff", baseline.treeHash]);
    if (diff.ok) {
      unifiedDiff = diff.stdout;
    }
    const nameOnly = await runGit(cwd, ["diff", "--name-only", baseline.treeHash]);
    if (nameOnly.ok) {
      files = [
        ...new Set([
          ...files,
          ...nameOnly.stdout.split("\n").map((f) => f.trim()).filter(Boolean),
        ]),
      ];
    }
  } else if (baseline.head) {
    const diff = await runGit(cwd, ["diff", baseline.head]);
    if (diff.ok) unifiedDiff = diff.stdout;
    const unstaged = await runGit(cwd, ["diff"]);
    const staged = await runGit(cwd, ["diff", "--cached"]);
    unifiedDiff = [diff.stdout, unstaged.stdout, staged.stdout].filter(Boolean).join("\n");
    const nameOnly = await runGit(cwd, ["diff", "--name-only", baseline.head]);
    if (nameOnly.ok) {
      files = [
        ...new Set([
          ...files,
          ...nameOnly.stdout.split("\n").map((f) => f.trim()).filter(Boolean),
        ]),
      ];
    }
  }

  // Include untracked file contents briefly for coverage
  const untracked = filesFromStatus.filter((_, i) => {
    const line = status.stdout.split("\n")[i]?.trim() ?? "";
    return line.startsWith("??");
  });
  for (const file of untracked) {
    try {
      const content = await Bun.file(`${cwd}/${file}`).text();
      const truncated = content.length > 4000 ? `${content.slice(0, 4000)}\n…[truncated]` : content;
      unifiedDiff += `\n--- /dev/null\n+++ b/${file}\n${truncated
        .split("\n")
        .map((l) => `+${l}`)
        .join("\n")}\n`;
    } catch {
      // ignore unreadable untracked files
    }
  }

  return {
    available: true,
    files: [...new Set(files)],
    unifiedDiff,
    status: status.ok ? status.stdout : "",
  };
}
