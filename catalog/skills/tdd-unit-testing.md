---
# Auto-generado por init-claude
name: tdd-unit-testing
description: Tests unitarios fiables y TDD. Usar al añadir logica o arreglar bugs.
---
Ciclo: red (test que falla) -> green (minimo para pasar) -> refactor (con tests verdes). Para un bug: primero el test que lo reproduce, luego el fix.
Estructura AAA (Arrange-Act-Assert), un comportamiento por test, nombre que describe el caso ("devuelve 0 si la lista esta vacia"). Testea comportamiento publico, no detalles internos.
Determinista: sin orden entre tests, sin tiempo/red/aleatoriedad reales (inyecta clock/random, fija seeds, fakea I/O). Cero `sleep`: espera condiciones. Un test flaky se arregla o se borra, no se reintenta.
Cobertura: prioriza ramas y edge cases (vacio, limite, error, null, grande) sobre el % total. No persigas 100%. Mockea fronteras (red/BD), no todo: tests sobre-mockeados no prueban nada.
Rapidos: la suite unitaria corre en segundos. Antes de entregar: la suite pasa en local en limpio.
