# CLAUDE.md

Reglas de comportamiento. Reglas propias del proyecto: bloque CUSTOM al final (sobrevive regeneraciones).

## Memoria de sesion

- Gestionada por context-mode. Datos reales en `~/.claude/context-mode/` (content/ y sessions/, SQLite con nombres hasheados).
- No se consulta navegando archivos: usa `ctx_search`. Estado: di "ctx stats".

## Contexto del proyecto (auto-detectado)

- Stack: javascript.
- Tamano: 16 archivos de codigo (small).
- Tests: si. CI: si. Docs: no.
- Si esta seccion queda obsoleta, re-ejecuta init-claude.

## Idioma y tono

- Responde en espanol. Comentarios en codigo y commits en ingles.
- Directo, sin preambulos. Critico cuando algo este mal. Honestidad sobre amabilidad.
- No expliques lo obvio. Asume nivel senior. Minimiza tokens.

## Modelo

- Modelo por defecto del usuario para trabajo normal.
- Escala al modelo superior disponible solo si: 2 intentos fallidos, diseno no trivial, o debugging complejo.
- Si te atascas 2 turnos: avisa y SUGIERE escalar. No cambies automaticamente.

## Plan first (cambios grandes)

- Si toca 3+ archivos o cruza modulos: subagente `planner` antes de tocar nada.
- Espera confirmacion explicita.

## /compact disciplinado

- Siempre especifica que preservar. Nunca compactes por limite sin instrucciones.

## Herramientas

- `context-mode`: memoria de sesion. Antes de re-leer: `ctx_search`. Outputs grandes: `ctx_execute`/`ctx_batch_execute`/`ctx_fetch_and_index`.
- `context7`: docs actualizadas de librerias. Siempre antes de generar codigo con librerias que cambian rapido.
- `rtk`: prefijo OBLIGATORIO en comandos Bash verbosos (git/npm/cargo/jest/pytest). Ej: rtk git status.
- `vault` (Obsidian, filesystem MCP): conocimiento persistente. Lee la nota antes de escribir (merge, no sobrescribir). Decisiones, bugs+causa raiz, research, resumenes de sesion.
- `codebase-memory-mcp`: grafo estructural del codigo. Indexa el repo una vez (index_repository), luego trace_path/get_architecture/detect_changes/query_graph. Auto-sync tras indexar.

## Subagentes

- `planner`: cambios complejos antes de tocar nada.
- `code-reviewer`: despues de escribir o modificar codigo.
- `bug-investigator`: bugs que necesitan causa raiz.
- `test-runner`: verificar regresiones tras cambios.
- `designer`: crear o criticar disenos UI/UX, logos, landings.


## Superpowers (workflow del main thread)

- Brainstorming: `superpowers:brainstorming`.
- Planes: `superpowers:writing-plans` / `executing-plans`; delegar con contexto aislado: subagente `planner`.
- TDD: `superpowers:test-driven-development`.
- Debugging: `superpowers:systematic-debugging`; delegado: `bug-investigator`.
- Antes de marcar terminado: `superpowers:verification-before-completion`.
- Code review: `superpowers:requesting-code-review` + subagente `code-reviewer`.
- NO uses `superpowers:using-git-worktrees` salvo peticion explicita.

## Skills custom (auto-recomendacion)

Recomienda crear skill SOLO si: tarea repetida 3+ veces, >500 tokens ahorrados/uso, estructura clara.
Cuando lo sugieras: propone el SKILL.md completo.

## Git y commits (REGLAS ESTRICTAS)

- NUNCA `git commit` ni `git push` sin autorizacion EXPLICITA en este turno.
- NUNCA Co-Authored-By: Claude, Generated with Claude Code, emoji robot en commits.
- Conventional commits. Subject <=50 chars. Porque sobre que.
- Antes de commit: muestra staged + mensaje. Espera OK. Antes de push: confirma destino.
- Hook commit-msg instalado rechaza refs a IA. Si falla: edita mensaje, NO uses --no-verify.

## Codigo

- Sin comentarios obvios. Sin emojis. Sigue estilo existente. No deps nuevas sin justificar.
- No modificar estilo fuera de la tarea actual.

## Tests

- Antes de marcar completada: ejecuta tests (`test-runner`).
- Funcionalidad nueva no trivial: anade test. Codigo cubierto modificado: test pasa o actualizalo.

## Definition of done

Una tarea esta terminada solo si: tests pasan, lint limpio, sin TODOs nuevos sin justificar,
diff revisado completo antes de entregar. Si algo de esto falla: la tarea NO esta terminada, dilo.

## Errores en sesion

- Comando falla 2 veces con el mismo error: PARA. Reporta el error exacto y propone alternativas.
- No insistas en bucle con variaciones minimas. No silencies errores con try/catch vacios.
- Si un hook o tool es denegado: no lo reintentes igual; pregunta o cambia de enfoque.

## Dependencias

- No instalar sin avisar. Justifica cada dependencia nueva (que aporta vs hacerlo a mano).
- Respeta el rango de versiones del proyecto. No hagas upgrades mayores como efecto colateral.
- Si detectas dependencia vulnerable o abandonada: avisa, no la cambies por tu cuenta.

## Secretos

- NUNCA pegues valores de .env, tokens o credenciales en respuestas, commits, logs o codigo.
- Referencia por nombre de variable (`process.env.API_KEY`), nunca por valor.
- Si un secreto aparece hardcodeado en el codigo: avisa inmediatamente.

## Operaciones destructivas

Confirmacion antes de: rm -rf, git push --force, git reset --hard, git clean -fdx,
migraciones DB, borrado sin refs, cambios >10 archivos.

## Que NO hacer

- No leer: .env, secrets/, credenciales, node_modules/, dist/, build/, .next/, .git/, __pycache__/, .venv/.
- No generar README/docs nuevos salvo peticion explicita.
- No instalar dependencias sin avisar.

