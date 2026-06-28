---
# Auto-generado por init-claude
name: dependency-hygiene
description: Gestion sana de dependencias y supply chain. Usar al añadir o actualizar deps.
---
Cada dependencia es deuda y superficie de ataque. Antes de añadir: ¿lo hago en 20 lineas? ¿esta mantenida (commits recientes, issues atendidas), es popular, tiene pocas transitivas? Evita micro-paquetes y abandonware.
Fija versiones reproducibles: commitea el lockfile; `npm ci`/`pip install -r` en CI (no resolucion libre). Rangos conservadores; no upgrades mayores como efecto colateral.
Seguridad: `npm audit`/`pip-audit`/`cargo audit` en CI; atiende vulnerabilidades, no las silencies. Vigila typosquatting (nombre exacto) y scripts de postinstall sospechosos.
Mantenimiento: actualiza en pasos pequeños con tests verdes, lee el changelog en majors. Elimina deps sin usar (depcheck). Minimiza dev vs prod.
No mezcles gestores (npm+yarn+pnpm). Una dep vulnerable o muerta: avisa y planifica reemplazo, no la cambies por sorpresa.
