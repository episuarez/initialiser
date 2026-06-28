# Contributing

## Project layout

TypeScript (strict), bundled with `tsup` to a committed `dist/`. Source in `src/`, entry in `bin/init-claude.ts`, commands in `src/commands/`. The catalog (`catalog/components.json`) is validated by a **zod** schema (`src/catalog.ts`) — types are inferred from it.

```bash
npm install         # installs deps (approves esbuild's build script)
npm run typecheck   # tsc --noEmit
npm test            # vitest
npm run build       # tsup → dist/init-claude.js   (commit the result)
```

> `dist/` is committed on purpose: users install with `npm install --omit=dev` and run the prebuilt bundle (no local build). CI verifies `dist/` is in sync with the source.

## Adding a component to the catalog

Edit `catalog/components.json` — no code changes needed. The entry is validated against the zod schema on load.

```jsonc
{
  "id": "my-tool",            // unique, kebab-case
  "name": "My Tool",          // display name in the wizard
  "group": "Analisis",        // Core | Analisis | Web | Git | Optimizacion | Documentos | Diseno | Memoria | Skills
  "tier": "suggested",        // core (always) | suggested (pre-checked on a signal) | available (opt-in, never pre-checked)
  "desc": "Short description shown in the wizard — what it is and what it does.",
  "recommendIf": ["frontend", "sizable"],   // profile tags that trigger a pre-check (OR)
  "requireTags": ["sizable"],               // optional: ALL must hold (AND) — e.g. only on big repos
  "install": { "type": "npm", "pkg": "my-tool" },
  "mcp": { "name": "my-tool", "cmd": "npx -y my-tool-mcp" },
  "claudemd": "- `my-tool`: one-line hint injected into CLAUDE.md."
}
```

### Install types

| `type` | What it does |
|--------|-------------|
| `npm` | `npm install -g <pkg>` |
| `pipx` | `pipx install <pkg>` (`also`/`post` for extra steps) |
| `project-npx` | runs an `npx` command inside the project (e.g. autoskills) |
| `installer` | official install script (`shUrl`/`psUrl`) |
| `rtk` | RTK installer (cargo) |
| `husky` | husky + lint-staged setup |
| `null` / omitted | MCP only, no binary to install |

### Optional fields

- `conflictsWith`: ids that do the same job (the wizard makes you pick one; must be symmetric).
- `recommendIfToolSearch`: tags that pre-check an `available` component only when MCP Tool Search is on.
- `docTier: "discovery"`: with Tool Search on, fold this tool's `claudemd` into a single index line (Claude discovers it by search).
- `memoryLevel: "durable" | "semantic"`: handled in the wizard's Memory step instead of the general picker.
- `userSkills`: skill ids copied to the user's `~/.claude/skills` when this component is installed.

### Profile tags

`javascript` `python` `go` `rust` `java` `csharp` `unity` `frontend` `backend-node` `backend-python` `e2e` `docs` `design` `docker` `ai` `small` `medium` `large` `sizable` `monorepo` `ci` `tests` `tests-node` `git`

### Adding a project skill

1. Add a `.md` file to `catalog/skills/` with frontmatter (keep the signature line so regeneration recognizes it):
   ```markdown
   ---
   # Auto-generado por init-claude
   name: my-skill
   description: One-line description of when to use it.
   ---
   Dense, actionable rules. No fluff.
   ```
2. Add a record to `projectSkills` in `components.json`:
   ```json
   { "id": "my-skill", "desc": "Same description.", "recommendIf": ["frontend"] }
   ```
   Use `"always": true` (no `recommendIf`) for a skill that should install in every project.

Skills install as `.claude/skills/my-skill/SKILL.md` (the layout Claude Code auto-discovers). A test enforces that every `projectSkills` id and every `userSkills` reference has a matching file.

## Before opening a PR

```bash
npm run typecheck      # no type errors
npm test               # all green (Vitest)
npm run build          # rebuild dist/  ← commit it
npm run build:readme   # if you changed the catalog (regenerates the README table)
```

CI runs all of the above plus `check:dist` (dist in sync) and `check:readme` on every push.

## Code style

- TypeScript, strict. No new runtime dependencies without a strong reason (justify the trade-off vs doing it by hand).
- Keep `bin/init-claude.ts` thin (arg parse + dispatch); logic lives in `src/` and `src/commands/`.
- Match the existing terse, comment-light style. No emojis in code.
