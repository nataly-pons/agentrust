# AgentTrust

Responde por cada cambio que hizo tu agente de Claude Code.

Al cerrar una sesión, AgentTrust genera un borrador local que explica **qué cambió**, **por qué**, **qué supuestos tomó el agente** y **qué hizo fuera de lo pedido**, con evidencia marcada como declarada o inferida.

Nada se escribe en tu repositorio git. Todo vive en `~/.agenttrust/`.

## Requisitos

- [Bun](https://bun.sh) ≥ 1.1
- [Claude Code](https://code.claude.com)
- Git (recomendado)
- `ANTHROPIC_API_KEY` en el entorno (para generar el informe)

## Instalación (2 pasos)

```bash
bun install
bun run build
```

Añade el binario a tu PATH:

**Windows (PowerShell):**

```powershell
$dest = "$env:USERPROFILE\bin"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item .\dist\agenttrust.exe $dest\agenttrust.exe -Force
# Añade $dest al PATH de usuario si aún no está:
setx PATH "$env:PATH;$dest"
```

**macOS / Linux:**

```bash
mkdir -p "$HOME/bin"
cp dist/agenttrust "$HOME/bin/agenttrust"
chmod +x "$HOME/bin/agenttrust"
# asegúrate de que ~/bin esté en tu PATH
```

Sin compilar, también puedes usar:

```bash
bun run src/cli.ts <comando>
```

## Uso

```bash
agenttrust init          # conecta el hook a Claude Code (~/.claude/settings.json)
# …trabaja con Claude Code con normalidad…
agenttrust open          # abre el último informe en el navegador
agenttrust why           # regenera el informe de la última sesión
agenttrust open --list   # lista sesiones
agenttrust open --pr     # copia el bloque listo para el PR
agenttrust pack          # ZIP acumulativo para el piloto concierge
agenttrust uninstall     # restaura la configuración de Claude Code
```

Tras `init`, al cerrar una sesión de Claude Code verás:

```text
Borrador listo · agenttrust open
```

### `init --project`

Instala los hooks en `.claude/settings.json` del directorio actual en lugar de `~/.claude/settings.json`.

## Qué captura

| Hook | Acción |
|------|--------|
| `SessionStart` | Baseline de git (`write-tree` / `HEAD`) |
| `UserPromptSubmit` | Prompts del usuario (redactados) |
| `PostToolUse` | Herramientas y archivos tocados |
| `SessionEnd` (async) | Diff real vs baseline + generación del borrador |

## Almacenamiento local

```text
~/.agenttrust/
  sessions/     # capturas JSON por session_id
  reports/      # .json + .html del borrador
  events.jsonl  # métricas sin contenido ni código
  backups/      # settings de Claude Code antes de init
  packs/        # ZIPs del piloto
```

## Desarrollo

```bash
bun install
bun run src/cli.ts help
bun run typecheck
bun run build
```

### Fixtures de aceptación

En `fixtures/` están las sesiones A/B/C del Anexo B:

- **A** — cambio no pedido (`Modal.tsx` además de `Button.tsx`)
- **B** — borrado vía bash en DB de prueba
- **C** — supuesto implícito sobre volumen de datos

Puedes copiar un `capture.json` a `~/.agenttrust/sessions/` y correr `agenttrust why <session_id>`.

## Checklist de aceptación (MVP)

- [ ] AC1 `init` en ≤2 pasos / ≤5 min, sin romper hooks previos
- [ ] AC2 `uninstall` restaura settings
- [ ] AC3 el hook no escribe en el repo (`git status` solo muestra cambios del agente)
- [ ] AC4 100 % de archivos del diff en el borrador
- [ ] AC5 marca fuera de lo pedido (sesiones A/B)
- [ ] AC6 lista supuestos (sesión C)
- [ ] AC7 razones `declared` con cita real
- [ ] AC8 borrador ≤60s, SessionEnd no bloquea (async)
- [ ] AC9 secretos redactados
- [ ] AC10 `open` / `--list` / `--pr`
- [ ] AC11 eventos locales sin contenido
- [ ] AC12 `pack` acumulativo + `--exclude`
- [ ] AC13 cada borrador registra `prompt_version` (v1)

## Privacidad

Solo se envía al modelo el diff y fragmentos de sesión ya redactados. Claves, tokens y valores tipo `.env` se enmascaran antes de la API, del bloque PR y del ZIP.
