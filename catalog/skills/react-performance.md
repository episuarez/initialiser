---
# Auto-generado por init-claude
name: react-performance
description: Rendimiento React sin sobre-optimizar. Usar ante renders lentos o listas grandes.
---
Mide antes de optimizar: React DevTools Profiler. No memoices a ciegas — `memo`/`useMemo`/`useCallback` solo con re-render medible y caro; cada uno tiene coste y oculta bugs de deps.
Causas comunes: objetos/arrays/funciones nuevas en props cada render; estado demasiado arriba (sube el estado solo lo necesario, o colocalo). Deriva en render en vez de duplicar en estado/effect.
Listas: `key` estable (no el indice si reordena). Listas largas -> virtualizacion (react-window). Pagina/segmenta.
Effects: minimiza; sincroniza con sistemas externos, no para derivar datos. Limpia subscripciones. Evita cascadas de effects que disparan renders.
Carga: code-splitting por ruta (`lazy`+`Suspense`), transiciones (`useTransition`) para updates no urgentes. Imagenes con dimensiones y lazy.
Antes de entregar: el Profiler confirma menos renders/commits, no "creo que va mas rapido".
