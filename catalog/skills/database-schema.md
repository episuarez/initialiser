---
# Auto-generado por init-claude
name: database-schema
description: Diseño de esquema SQL e indices. Usar al modelar datos o escribir migraciones.
---
Normaliza por defecto (3FN): una verdad en un sitio. Desnormaliza solo con motivo de rendimiento medido. PK estable (uuid/identity); FKs explicitas con ON DELETE consciente.
Tipos correctos: timestamps con zona (`timestamptz`), `numeric` para dinero (nunca float), enums/check para dominios cerrados, `not null` salvo razon. Constraints en BD, no solo en app (unique, check, fk).
Indices: para columnas de WHERE/JOIN/ORDER frecuentes; compuestos en el orden de uso; cubre con EXPLAIN. No indexes inutiles (frenan writes). Indexa FKs.
Migraciones: versionadas, idempotentes, reversibles; cambios aditivos primero (add column nullable -> backfill -> constraint) para deploy sin downtime. Nunca edites una migracion ya aplicada.
Consultas: parametrizadas (anti-inyeccion), evita SELECT *, pagina con keyset en tablas grandes. Mide con EXPLAIN ANALYZE antes de dar por buena.
