---
# Auto-generado por init-claude
name: figma-to-code
description: Convierte diseños de Figma a HTML/CSS/React/Vue con tokens exactos.
---
Inputs: URL Figma (con Figma MCP), screenshot, descripcion, o export (tokens/SVG/CSS).
1. EXTRAE TOKENS antes de codificar: colores hex, tipografia, spacing, radii, sombras, breakpoints.
2. HTML SEMANTICO + accesibilidad.
3. IMPLEMENTA segun stack: HTML/CSS (variables :root), React+Tailwind, Vue SFC.
4. FIDELIDAD: lista decisiones, diferencias con Figma, assets manuales pendientes.
Mobile-first. Sin Figma MCP: pide export/screenshot.
