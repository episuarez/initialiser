---
# Auto-generado por init-claude
name: documentation-writing
description: Documentacion que la gente usa. Usar al escribir README, docs o ADRs.
---
README orientado a tareas: que es (1 frase), por que/para quien, quickstart que funciona copy-paste (requisitos, instalar, primer uso), y donde seguir. El usuario debe arrancar en <5 min.
Escribe para quien no tiene tu contexto: ejemplos reales ejecutables sobre prosa, comandos exactos, salidas esperadas. Documenta el PORQUE (decisiones, trade-offs), no solo el que (el codigo ya lo cuenta).
Decisiones de arquitectura: ADRs cortos (contexto, opciones, decision, consecuencias) versionados con el codigo. Mantenlos cuando cambien.
Cerca del codigo y vivo: docs en el repo, actualizadas en el mismo PR que el cambio. Doc desactualizada es peor que no tenerla — borra lo obsoleto. Enlaza, no dupliques.
Conciso y escaneable: titulos claros, listas, bloques de codigo, tablas para opciones. Sin relleno. No generes README/docs nuevos salvo que se pidan.
