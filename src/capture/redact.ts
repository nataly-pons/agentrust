const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[A-Za-z0-9_-]{10,})\b/g,
  /\b(sk-ant-[A-Za-z0-9_-]{10,})\b/g,
  /\b(ghp_[A-Za-z0-9]{20,})\b/g,
  /\b(github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
  /\b(AIza[0-9A-Za-z_-]{20,})\b/g,
  /\b(AKIA[0-9A-Z]{16})\b/g,
  /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[=:]\s*)(["']?)[^\s"']+\1/gi,
  /(?<=(?:PASSWORD|SECRET|TOKEN|API_KEY|ACCESS_KEY)\s*[=:]\s*)(["']?)[^\s"']+\1/g,
];

const ENV_LINE =
  /^([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*=\s*(.+)$/gim;

export function redactText(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  out = out.replace(ENV_LINE, "$1=[REDACTED]");
  return out;
}

export function redactObject<T>(value: T): T {
  if (typeof value === "string") {
    return redactText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as T;
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (/key|token|secret|password|passwd|credential|auth/i.test(key) && typeof val === "string") {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(val);
      }
    }
    return result as T;
  }
  return value;
}
