---
# Auto-generado por init-claude
name: secure-coding
description: Codigo seguro (OWASP). Usar al manejar entrada externa, datos o dependencias.
---
Toda entrada externa es hostil: valida en servidor (allowlist, tipo, rango, longitud), no confies en validacion de cliente. Inyeccion: consultas parametrizadas (nunca concatenar SQL), evita `eval`/shell con input; si hay shell, sin interpolar (args array).
Salida: escapa segun contexto (HTML/atributo/JS/URL) para evitar XSS; CSP estricta. No reflejes input sin sanear.
Secretos: fuera del codigo y del repo (env/secret manager). Nunca en logs, errores o cliente. Rota si se filtran.
AuthZ en cada acceso a recurso (evita IDOR): comprueba ownership, deny by default. SSRF: valida/allowlist URLs salientes. Deserializacion: nunca de fuentes no confiables.
Dependencias: auditadas y al dia (`npm audit`/`pip-audit`); fija versiones. Cripto: usa librerias estandar, no inventes; TLS en transito, hashing fuerte para passwords. Principio de minimo privilegio en todo.
