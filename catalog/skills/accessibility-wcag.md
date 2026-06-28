---
# Auto-generado por init-claude
name: accessibility-wcag
description: Accesibilidad web WCAG 2.2 AA. Usar al construir o revisar UI.
---
HTML semantico primero: `<button>` para acciones, `<a>` para navegar, headings jerarquicos (h1->h2, sin saltos), `<nav>/<main>/<header>`. ARIA solo cuando el HTML no basta (regla: "no ARIA es mejor que mal ARIA").
Teclado: todo lo operable con raton lo es con teclado. Foco visible (no quites el outline sin reemplazo). Orden de tab logico. Trampa de foco en modales + Escape cierra. `:focus-visible`.
Formularios: cada input con `<label>` asociado (for/id). Errores enlazados con `aria-describedby`, no solo color. Estados `aria-invalid`.
Contraste AA: texto 4.5:1, texto grande/UI 3:1. No transmitas info solo por color.
Imagenes: `alt` descriptivo (vacio si decorativa). Media con captions. Respeta `prefers-reduced-motion`.
Anuncia cambios dinamicos con `aria-live`. Verifica con teclado real + lector de pantalla o axe; el linter no basta.
