---
# Auto-generado por init-claude
name: api-design
description: Convenciones para endpoints de API. Usar al crear o cambiar rutas REST.
---
REST: recursos en plural, sin verbos en URL, anidamiento max 2 niveles. GET nunca muta.
Codigos: 200/201(+Location)/204/400/401/403/404/409/422/500. Formato de error consistente: { error: { code, message, details } }. Nunca stack traces al cliente.
Validacion: todo input en el borde (zod/joi/pydantic). Rechaza campos desconocidos en payloads criticos.
Listados siempre paginados (?page/?limit max 100 o cursor) con metadata { data, total, page, pages }.
Seguridad: auth en middleware, rate limiting en publicos, UUID/nanoid en recursos privados.
Antes de entregar: probado con input valido/invalido/vacio/masivo. Documentado.
