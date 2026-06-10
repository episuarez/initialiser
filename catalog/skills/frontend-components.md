---
# Auto-generado por init-claude
name: frontend-components
description: Patrones para componentes frontend de calidad. Usar al crear o modificar componentes React/Vue/Svelte.
---
Estructura: un componente = una responsabilidad (<150 lineas), props tipadas, logica reutilizable en hooks/composables, co-locacion componente+estilos+test.
Estados obligatorios con datos remotos: loading (skeleton), error (accionable+retry), empty (CTA), success.
Accesibilidad: aria-label en botones icono, labels en inputs, navegable por teclado, contraste WCAG AA (4.5:1/3:1), alt en imagenes.
Performance: lazy load rutas pesadas, memoizar solo con re-renders medibles, dimensiones explicitas en imagenes.
Antes de entregar: funciona con datos vacios/enormes/strings largos. Sin console.log ni estilos inline.
