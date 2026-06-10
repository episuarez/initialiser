# Contributing

## Adding a component to the catalog

Edit `catalog/components.json` — no code changes needed.

```jsonc
{
  "id": "my-tool",           // unique, kebab-case
  "name": "My Tool",         // display name in the wizard
  "group": "Analysis",       // wizard group: Core | Analysis | Web | Orchestration | Git | Optimization | Documents | Design
  "desc": "Short description shown in the wizard.",
  "recommendIf": ["frontend", "large"],  // profile tags that trigger a pre-check (OR logic)
  "alwaysOn": false,                      // true = always pre-checked regardless of profile
  "install": { "type": "npm", "pkg": "my-tool" },
  "mcp": { "name": "my-tool", "cmd": "npx -y my-tool-mcp" },
  "claudemd": "- `my-tool`: one-line hint injected into CLAUDE.md."
}
```

### Install types

| `type` | What it does |
|--------|-------------|
| `npm` | `npm install -g <pkg>` |
| `pipx` | `pipx install <pkg>` |
| `rtk` | Custom RTK installer (cargo) |
| `husky` | husky + lint-staged setup |
| `null` | MCP only, no binary to install |

### Profile tags for `recommendIf`

`javascript` `python` `go` `rust` `java` `csharp` `unity` `frontend` `backend-node` `backend-python` `e2e` `docs` `design` `small` `medium` `large` `monorepo` `ci` `tests` `tests-node` `git` `git-deps`

### Adding a project skill

1. Add a `.md` file to `catalog/skills/` with this frontmatter:
   ```markdown
   ---
   name: my-skill
   description: One-line description of when to use it.
   ---
   Skill content here.
   ```
2. Add a record to `projectSkills` in `components.json`:
   ```json
   { "id": "my-skill", "desc": "Same description.", "recommendIf": ["frontend"] }
   ```

The skill is installed as `.claude/skills/my-skill/SKILL.md` (the layout Claude Code auto-discovers).

## Validation

Before opening a PR, verify the catalog JSON is valid:

```bash
node -e "JSON.parse(require('fs').readFileSync('catalog/components.json','utf8')); console.log('OK')"
```

Or let CI do it — a GitHub Actions workflow runs on every push.

## Code style

- ESM modules (`.mjs`), Node.js ≥ 18, no TypeScript.
- No new runtime dependencies without a strong reason.
- Keep `bin/init-claude.mjs` as entry point only — logic goes in `src/`.
