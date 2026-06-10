---
# Auto-generado por init-claude
name: e2e-testing
description: Patrones para tests E2E robustos. Usar al crear o modificar tests Playwright/Cypress.
---
Selectores (orden): 1) data-testid 2) getByRole 3) getByText estable. NUNCA clases CSS, XPath fragil, nth-child.
Esperas: NUNCA sleep fijos. waitForSelector/waitForResponse/expect con retry. Si necesita sleep: race condition real, investiga.
Estructura: Page Object Model para flujos repetidos. Tests independientes. Setup via API cuando sea posible.
Datos: unicos por ejecucion (timestamp/uuid). Limpieza en afterEach.
Anti-flakiness: test que falla 1/N = bug del test. Screenshot+trace en fallos. Viewport fijo.
