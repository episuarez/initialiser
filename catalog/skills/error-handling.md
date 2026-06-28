---
# Auto-generado por init-claude
name: error-handling
description: Manejo de errores explicito. Usar al escribir codigo que puede fallar.
---
Falla ruidoso, no silencioso: nada de `catch {}` vacios ni tragar excepciones. Si no puedes manejarlo, propaga; maneja en la frontera donde hay contexto para decidir.
Errores con significado: tipos/clases especificas, no strings genericos; incluye contexto (que operacion, que entrada relevante — sin secretos). Distingue error esperado (entrada invalida -> resultado) de bug (estado imposible -> falla rapido).
No uses excepciones para flujo normal. Valida en la entrada (fail fast) en vez de defenderte en cada capa. Errores de usuario: accionables y claros; errores internos: log completo + mensaje generico al exterior.
Recursos: libera siempre (`finally`/`defer`/`with`/RAII), incluso en error. Reintenta solo lo idempotente, con backoff y limite. Timeouts en todo I/O.
Nunca expongas stack traces ni internals al usuario final. No registres datos sensibles en el error.
