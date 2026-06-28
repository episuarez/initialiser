---
# Auto-generado por init-claude
name: git-commit-hygiene
description: Commits y ramas limpios. Usar al versionar cambios.
---
Commits atomicos: uno por cambio logico, que compila y pasa tests por si solo. No mezcles refactor + feature + fix. Stagea por hunks (`git add -p`) si hace falta separar.
Conventional commits: `tipo(scope): asunto` en imperativo, <=50 chars, sin punto final. Tipos: feat/fix/refactor/docs/test/chore/perf/build. El cuerpo explica el PORQUE (el que ya esta en el diff); referencia issues.
Nunca commitees: secretos, `.env`, artefactos de build, `node_modules`, archivos enormes, codigo comentado/muerto, `console.log` de debug. Revisa el diff staged antes de commitear.
Ramas: cortas y enfocadas; rebase para mantener lineal antes de mergear (no reescribas historia ya compartida). PRs pequeños y revisables (<~400 lineas).
Sin referencias a IA en el mensaje (Co-Authored-By Claude, "generated with", emoji robot). No `--no-verify` para saltar hooks: arregla el motivo.
