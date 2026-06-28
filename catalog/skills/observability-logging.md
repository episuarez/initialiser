---
# Auto-generado por init-claude
name: observability-logging
description: Logs, metricas y trazas utiles. Usar en servicios backend.
---
Logs estructurados (JSON), no texto libre: campos consistentes (timestamp, level, message, request_id, user_id si aplica). Un evento = una linea. Nada de `print`/`console.log` en produccion.
Niveles con criterio: ERROR (accion humana necesaria), WARN (anomalia recuperable), INFO (hitos de negocio), DEBUG (diagnostico, off en prod). No spamees INFO en bucles calientes.
Nunca loguees secretos ni PII (passwords, tokens, tarjetas, emails segun normativa): enmascara. Cumple retencion/GDPR.
Correlacion: propaga un request/trace id por toda la cadena (logs+trazas) para seguir una peticion. Tracing distribuido (OpenTelemetry) en sistemas multi-servicio.
Las tres señales: logs (que paso), metricas (cuanto/agregado: latencia p95/p99, error rate, throughput — RED/USE), trazas (donde se fue el tiempo). Alerta sobre sintomas que ve el usuario (SLO), no sobre cada pico. Health checks + dashboards.
