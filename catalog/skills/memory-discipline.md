---
# Auto-generado por init-claude
name: memory-discipline
description: Que recordar y donde. Aplicar al guardar o recuperar conocimiento.
---
Memoria por CAPAS — usa la correcta segun el alcance, no las mezcles:
- Sesion (context-mode): que se hizo, para sobrevivir a /compact. Antes de re-leer algo, `ctx_search`. No lo dupliques en notas.
- Proyecto compartido (bloque CUSTOM de CLAUDE.md): decisiones que el agente necesita CADA sesion y que deben viajar con el codigo (versionadas). Mantenlo lean: solo lo imprescindible, pesa tokens fijos.
- Durable personal (Obsidian/basic-memory si esta instalado): research, decisiones largas con su porque, bugs+causa raiz, credenciales/IDs de servicios. Bajo demanda, no pesa contexto.
Reglas: antes de crear una nota, busca si ya existe (no dupliques) y haz merge en vez de sobrescribir. Una idea por nota (atomic). Enlaza notas relacionadas. Convierte fechas relativas a absolutas.
No metas en CLAUDE.md lo que es de sesion o durable-personal (infla el contexto de cada sesion). No guardes lo que el repo ya registra (estructura, git, fixes pasados).
Nunca guardes secretos en claro en notas compartidas/commiteadas; en durable personal, referencia por nombre cuando sea posible.
