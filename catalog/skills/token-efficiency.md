---
# Auto-generado por init-claude
name: token-efficiency
description: Disciplina para gastar minimos tokens. Aplicar SIEMPRE, en cualquier tarea.
---
Antes de re-leer algo ya visto: `ctx_search` (memoria de sesion), no `Read` otra vez. No re-leas un fichero que acabas de editar: el harness ya trackea su estado.
Outputs grandes (logs, builds, tests, JSON, snapshots): procesa en el sandbox (`ctx_execute`/`ctx_batch_execute`/`ctx_fetch_and_index`) y devuelve solo lo derivado; nunca vuelques bytes crudos al contexto.
Buscar: `Grep` o `ast-grep` con scope, no `Read` de ficheros enteros. `Read` solo el rango que necesitas (offset/limit). Pide diffs, no ficheros completos.
Bash verboso (git/npm/cargo/jest/pytest): prefijo `rtk` SIEMPRE para comprimir la salida 60-90%.
Logs/tool-outputs/RAG/ficheros grandes que no pasan por rtk: `headroom` SIEMPRE (compress/proxy), comprime 60-95% antes de llegar al LLM.
Busquedas amplias multi-fichero: delega a un subagente (Explore) que devuelve la conclusion, no los volcados de fichero.
Batch: lanza tool calls independientes en un solo mensaje (paralelo), no en serie.
MCP Tool Search activo: los schemas se cargan bajo demanda; no necesitas mantener tools cargadas.
Respuestas concisas: no repitas contexto ya establecido ni narres opciones que no vas a tomar. Menos tokens = mas presupuesto para razonar.
