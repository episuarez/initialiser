---
# Auto-generado por init-claude
name: performance-profiling
description: Optimizacion guiada por medicion. Usar ante lentitud o antes de optimizar.
---
Mide primero, nunca adivines: profiler/benchmark para localizar el cuello real. "Optimizacion prematura" = optimizar sin datos. El 80% del tiempo suele estar en el 20% del codigo — encuentralo.
Establece linea base y objetivo medible (p95 < X ms, memoria < Y). Cambia UNA cosa, re-mide, compara. Sin regresion comprobada, no es mejora.
Algoritmo antes que micro: una mejor complejidad (O(n) vs O(n^2)) gana a trucos. Reduce trabajo: cachea lo caro e idempotente (con invalidacion clara), evita N+1 (batch/join), no recalcules en bucle.
I/O suele dominar: paraleliza lo independiente, streaming en vez de cargar todo en memoria, conexiones reutilizadas (pool). En frontend: bundle size, lazy, menos renders.
No sacrifiques legibilidad sin ganancia medida y significativa. Documenta el porque de un hack de rendimiento. Guarda el benchmark como regresion.
