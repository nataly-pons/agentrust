# AgentTrust

Responde por cada cambio que hizo tu agente de **Claude Code**.

Al cerrar una sesión, genera un borrador local que explica **qué cambió**, **por qué**, **qué supuestos tomó el agente** y **qué hizo fuera de lo pedido**, con evidencia marcada como declarada o inferida.

Nada se escribe en tu repositorio git. Todo vive en `%USERPROFILE%\.agenttrust\`.

> Solo funciona con Claude Code (hooks). No captura sesiones de Cursor u otros agentes.

## Requisitos

- Windows + PowerShell
- [Bun](https://bun.sh) ≥ 1.1
- [Claude Code](https://code.claude.com)
- Git (recomendado)
- API key de Gemini en [Google AI Studio](https://aistudio.google.com/apikey)  
  (la suscripción de Google One / Gemini app **no** es esta key)

---

## Instalación (PowerShell)

Abre PowerShell en la carpeta del repo `agentrust` y ejecuta **en orden**:

### 1. Instalar dependencias y compilar

```powershell
cd C:\Users\natal\Documents\ESEN\agentrust
bun install
bun run build
```

### 2. Copiar el binario a tu carpeta `bin`

```powershell
$dest = "$env:USERPROFILE\bin"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item .\dist\agenttrust.exe "$dest\agenttrust.exe" -Force
```

### 3. Añadir `bin` al PATH de usuario (sin `setx`)

`setx` puede truncar el PATH en Windows. Usa esto:

```powershell
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($userPath -split ";" | Where-Object { $_ -eq $dest })) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$dest", "User")
}
$env:PATH += ";$dest"
```

### 4. Verificar

```powershell
agenttrust version
```

Si no lo reconoce en una terminal de Cursor, cierra Cursor por completo y ábrelo de nuevo, o en esa sesión corre:

```powershell
$env:PATH += ";$env:USERPROFILE\bin"
agenttrust version
```

---

## Cómo usarlo (PowerShell)

### 1. Configurar la API key (cada terminal nueva)

```powershell
$env:GEMINI_API_KEY = "pega-aqui-tu-key"
```

No subas la key al repo ni la pegues en chats.

### 2. Conectar AgentTrust a Claude Code

**En un solo proyecto de prueba (recomendado):**

```powershell
cd C:\ruta\a\tu\proyecto
agenttrust init --project
```

Eso escribe hooks en `.\.claude\settings.json` de ese proyecto.

**Para todos tus proyectos:**

```powershell
agenttrust init
```

Eso escribe en `%USERPROFILE%\.claude\settings.json`.

### 3. Trabajar con Claude Code

1. Abre **Claude Code** en ese proyecto.
2. Pídele un cambio (por ejemplo crear o editar un archivo).
3. Cierra la sesión.

Deberías ver:

```text
Borrador listo · agenttrust open
```

### 4. Abrir o regenerar el informe

```powershell
agenttrust open          # abre el último informe en el navegador
agenttrust why           # regenera el informe de la última sesión
agenttrust open --list   # lista sesiones capturadas
agenttrust open --pr     # copia al portapapeles el bloque para el PR
```

### 5. Comandos extra (piloto)

```powershell
agenttrust pack          # ZIP acumulativo para enviar al equipo
agenttrust uninstall     # quita los hooks y restaura la config de Claude Code
```

---

## Flujo rápido de prueba

```powershell
# 0) PATH + key (si hace falta en esta terminal)
$env:PATH += ";$env:USERPROFILE\bin"
$env:GEMINI_API_KEY = "pega-aqui-tu-key"

# 1) Repo de demo
mkdir C:\Users\natal\Documents\ESEN\agenttrust-demo
cd C:\Users\natal\Documents\ESEN\agenttrust-demo
git init
Set-Content -Path README.md -Value "# demo"
git add .
git commit -m "start"
agenttrust init --project

# 2) Abre Claude Code aquí, pide un cambio chico, cierra la sesión
# 3) Luego:
agenttrust open
```

---

## Qué captura

| Hook | Acción |
|------|--------|
| `SessionStart` | Baseline de git |
| `UserPromptSubmit` | Prompts del usuario (redactados) |
| `PostToolUse` | Herramientas y archivos tocados |
| `SessionEnd` (async) | Diff vs baseline + borrador con Gemini 2.5 Flash |

## Almacenamiento local

```text
%USERPROFILE%\.agenttrust\
  sessions\     # capturas JSON por session_id
  reports\      # .json + .html del borrador
  events.jsonl  # métricas sin contenido ni código
  backups\      # settings de Claude Code antes de init
  packs\        # ZIPs del piloto
```

## Privacidad

Solo se envía a Gemini el diff y fragmentos de sesión ya redactados. Claves, tokens y valores tipo `.env` se enmascaran antes de la API, del bloque PR y del ZIP.
