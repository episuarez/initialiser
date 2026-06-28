---
# Auto-generado por init-claude
name: typescript-quality
description: TypeScript robusto y sin any. Usar al escribir o revisar codigo TS/JS tipado.
---
`strict: true` siempre. Prohibido `any`: usa `unknown` + narrowing, generics o tipos concretos. `as` solo en fronteras (parse externo) y con validacion (zod/valibot), nunca para callar el compilador.
Modela estados imposibles fuera: discriminated unions (`{kind:'ok',data} | {kind:'err',error}`) en vez de flags booleanos sueltos. Prefiere `type` para uniones, `interface` para objetos extensibles.
Null safety: `strictNullChecks`, evita `!` (non-null assertion) salvo invariantes probadas; usa optional chaining y defaults.
Funciones: tipa el retorno explicitamente en API publica (evita inferencias que se filtran). `readonly`/`as const` para inmutabilidad. `satisfies` para validar sin ensanchar.
Errores tipados, no `throw 'string'`. No `enum` (prefiere union de literales). Sin `// @ts-ignore`: usa `@ts-expect-error` con motivo o arregla el tipo.
Antes de entregar: `tsc --noEmit` limpio. Cero `any` nuevos.
