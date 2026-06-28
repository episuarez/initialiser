---
# Auto-generado por init-claude
name: ci-cd-pipelines
description: Pipelines CI/CD rapidos y fiables. Usar al configurar o arreglar CI.
---
Feedback rapido: lint/typecheck/tests unitarios primero y en paralelo; lo lento (e2e, build pesado) despues o por etapas. Falla rapido (fail-fast). Objetivo: PR check en minutos, no decenas.
Reproducible: instala desde lockfile (`npm ci`), versiones de runtime pinadas, mismos pasos que en local. Cachea deps y artefactos de build con clave por hash del lock.
Calidad como gate, no como aviso: el merge requiere verde (tests + lint + typecheck + audit). Builds deterministas; si comiteas artefactos (dist), CI verifica que estan en sync.
Seguridad: secretos via store del CI (nunca en el yaml ni en logs), permisos minimos del token, no ejecutes codigo de PRs no confiables con secretos. Pin de actions por SHA.
Deploy: automatizado y reversible (rollback rapido), progresivo (canary/blue-green) en prod, healthcheck post-deploy. Idempotente. Sin pasos manuales fragiles.
