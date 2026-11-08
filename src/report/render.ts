import type { Evidence, ReportDraft } from "./schema";

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evidenceBadge(evidence: Evidence): string {
  const label =
    evidence.kind === "declared"
      ? "declarado"
      : evidence.kind === "inferred"
        ? "inferido"
        : "sin razón declarada";
  const citation = evidence.citation
    ? `<blockquote>${esc(evidence.citation)}</blockquote>`
    : "";
  return `<span class="badge ${evidence.kind}">${label}</span>${citation}`;
}

function mermaidDiagram(draft: ReportDraft): string {
  const asked = draft.asked[0] ? esc(draft.asked[0].slice(0, 60).replaceAll("\n", " ")) : "Pedido";
  const files = draft.file_changes.slice(0, 8);
  const lines = [
    "flowchart LR",
    `  ask["${asked}"]`,
  ];
  files.forEach((f, i) => {
    const id = `f${i}`;
    const label = esc(f.path.replaceAll('"', ""));
    lines.push(`  ${id}["${label}"]`);
    lines.push(`  ask --> ${id}`);
    if (f.unrequested || draft.unrequested.some((u) => u.path === f.path)) {
      lines.push(`  ${id} -.-> out["Fuera de lo pedido"]`);
    }
  });
  return lines.join("\n");
}

export function renderHtml(draft: ReportDraft): string {
  const fileRows = draft.file_changes
    .map(
      (f) => `
      <article class="change">
        <h3><code>${esc(f.path)}</code></h3>
        <p>${esc(f.summary)}</p>
        <p><strong>Por qué:</strong> ${esc(f.why)}</p>
        ${evidenceBadge(f.evidence)}
        ${f.unrequested ? '<p class="flag">Fuera de lo pedido</p>' : ""}
        ${f.no_trace ? '<p class="flag">Sin rastro en la sesión</p>' : ""}
      </article>`,
    )
    .join("\n");

  const assumptions = draft.assumptions.length
    ? draft.assumptions
        .map((a) => `<li>${esc(a.text)} ${evidenceBadge(a.evidence)}</li>`)
        .join("\n")
    : "<li>Ninguno detectado</li>";

  const unrequested = draft.unrequested.length
    ? draft.unrequested
        .map((u) => `<li><code>${esc(u.path)}</code> — ${esc(u.detail)} ${evidenceBadge(u.evidence)}</li>`)
        .join("\n")
    : "<li>Ninguno detectado</li>";

  const noTrace = draft.no_trace.length
    ? draft.no_trace
        .map((n) => `<li><code>${esc(n.path)}</code> — ${esc(n.detail)}</li>`)
        .join("\n")
    : "<li>Ninguno</li>";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AgentTrust — ${esc(draft.title)}</title>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({ startOnLoad: true, theme: "neutral" });
  </script>
  <style>
    :root {
      --bg: #f6f3ee;
      --ink: #1c1917;
      --muted: #57534e;
      --line: #d6d3d1;
      --accent: #0f766e;
      --warn: #b45309;
      --declared: #166534;
      --inferred: #9a3412;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #ddf4f0, transparent 40%),
        linear-gradient(180deg, #faf8f5, var(--bg));
      line-height: 1.5;
    }
    main {
      max-width: 840px;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
    }
    h1, h2, h3 { font-family: "IBM Plex Serif", Georgia, serif; font-weight: 600; }
    h1 { font-size: 2rem; margin: 0 0 0.35rem; }
    .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
    .summary {
      font-size: 1.1rem;
      border-left: 3px solid var(--accent);
      padding-left: 1rem;
      margin: 1.5rem 0;
    }
    section { margin: 2rem 0; }
    .change {
      padding: 1rem 0;
      border-bottom: 1px solid var(--line);
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.45rem;
      border: 1px solid var(--line);
      margin-right: 0.5rem;
    }
    .badge.declared { color: var(--declared); border-color: var(--declared); }
    .badge.inferred { color: var(--inferred); border-color: var(--inferred); }
    blockquote {
      margin: 0.5rem 0 0;
      padding: 0.5rem 0.75rem;
      background: #fff;
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.9rem;
    }
    .flag { color: var(--warn); font-weight: 600; }
    pre.pr {
      white-space: pre-wrap;
      background: #1c1917;
      color: #fafaf9;
      padding: 1rem;
      overflow-x: auto;
      font-family: "IBM Plex Mono", Consolas, monospace;
      font-size: 0.85rem;
    }
    code { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 0.9em; }
    .mermaid { background: #fff; padding: 1rem; border: 1px solid var(--line); }
  </style>
</head>
<body>
  <main>
    <p class="meta">AgentTrust · prompt ${esc(draft.prompt_version)} · sesión ${esc(draft.session_id)}</p>
    <h1>${esc(draft.title)}</h1>
    <p class="meta">${esc(draft.generated_at)}${draft.branch ? ` · rama ${esc(draft.branch)}` : ""}</p>
    <p class="summary">${esc(draft.summary)}</p>

    <section>
      <h2>Contraste pedido → hecho</h2>
      <pre class="mermaid">${mermaidDiagram(draft)}</pre>
    </section>

    <section>
      <h2>Lo que pediste</h2>
      <ol>
        ${draft.asked.map((a) => `<li>${esc(a)}</li>`).join("\n") || "<li>(sin prompts capturados)</li>"}
      </ol>
    </section>

    <section>
      <h2>Qué cambió y por qué</h2>
      ${fileRows || "<p>Sin cambios de archivos.</p>"}
    </section>

    <section>
      <h2>Supuestos</h2>
      <ul>${assumptions}</ul>
    </section>

    <section>
      <h2>Fuera de lo pedido</h2>
      <ul>${unrequested}</ul>
    </section>

    <section>
      <h2>Sin rastro en la sesión</h2>
      <ul>${noTrace}</ul>
    </section>

    <section>
      <h2>Bloque para el PR</h2>
      <pre class="pr">${esc(draft.pr_block)}</pre>
    </section>
  </main>
</body>
</html>`;
}

export function renderPrText(draft: ReportDraft): string {
  return draft.pr_block;
}
