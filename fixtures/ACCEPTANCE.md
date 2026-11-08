# Checklist de aceptación (Anexo B)

Usar las capturas en `fixtures/session-{a,b,c}/capture.json`.

```bash
cp fixtures/session-a/capture.json ~/.agenttrust/sessions/fixture-session-a.json
# repetir para b y c
export GEMINI_API_KEY=...   # para borrador completo (no fallback); modelo gemini-2.5-flash
agenttrust why fixture-session-a
agenttrust open fixture-session-a
```

| ID | Criterio | Cómo verificar |
|----|----------|----------------|
| AC1 | Install ≤2 comandos / ≤5 min | `bun install && bun run build` + PATH + `agenttrust init` |
| AC2 | uninstall restaura | `agenttrust uninstall` y diff de settings |
| AC3 | hook no escribe en el repo | `git status` tras una sesión solo muestra cambios del agente |
| AC4 | 100 % archivos del diff | sesión A: Button + Modal en el borrador |
| AC5 | fuera de lo pedido | A: Modal; B: DELETE en bash |
| AC6 | supuestos | C: volumen/memoria |
| AC7 | declared con cita | ninguna razón inventada como declared |
| AC8 | ≤60s, no bloquea | SessionEnd con `async: true` |
| AC9 | secretos | clave falsa en `.env` no aparece en prompt/PR/ZIP |
| AC10 | open / --list / --pr | prueba manual |
| AC11 | events.jsonl | 5 tipos, sin código |
| AC12 | pack acumulativo | segundo pack sin novedades avisa; `--exclude` |
| AC13 | prompt_version | campo `v1` en cada JSON de reporte |
