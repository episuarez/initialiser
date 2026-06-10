# init-claude

[![Version](https://img.shields.io/github/package-json/v/episuarez/initialiser?style=flat-square&label=version)](https://github.com/episuarez/initialiser/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/episuarez/initialiser/ci.yml?style=flat-square&label=CI)](https://github.com/episuarez/initialiser/actions)
[![License](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-orange?style=flat-square)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&logo=windows)]()
[![Claude Code](https://img.shields.io/badge/Claude%20Code-compatible-blueviolet?style=flat-square)](https://claude.ai/code)

**One command to set up Claude Code the right way — in any project.**

init-claude is a CLI/TUI tool that scans your project, detects its profile (languages, frameworks, size, docs, design files, CI), and walks you through installing exactly the Claude Code components, MCP servers, and project skills that make sense for it. No config files to write. No docs to read. Just run it and pick what you want.

---

## What it does

### Detects your project automatically

When you run `init-claude`, it scans the current directory and builds a profile:

- **Languages**: JavaScript/TypeScript, Python, C#/Unity, and more
- **Frameworks**: Next.js, React, FastAPI, Express, …
- **Project size**: small / medium / large / monorepo
- **Extras**: has docs? design files (.pen, Figma)? CI config? E2E tests?

Based on that profile, it pre-selects the components and skills that fit best.

### Interactive wizard — you stay in control

A terminal UI (powered by [@clack/prompts](https://github.com/bombshell-dev/clack)) shows you:

1. **Components** — full catalog with groups and descriptions, recommended ones pre-checked. Navigate with arrows, toggle with space. Change anything you want.
2. **Project skills** — `.claude/skills/` snippets for your stack (frontend patterns, REST conventions, Python quality, E2E testing, Unity…).
3. **Extras** — download a skill from any URL (raw `.md` or GitHub repo), or add custom rules/notes to your `CLAUDE.md` inline.

### Installs what you select

For each chosen component, init-claude:

- Installs the package (`npm -g`, `pipx`, `cargo`, custom scripts)
- Registers the MCP server in Claude Code's global config
- Injects the matching usage hint in your project's `CLAUDE.md`
- Copies skills to `.claude/skills/<name>/SKILL.md` (the layout Claude Code auto-discovers), project-level or user-level as appropriate
- Sets up git hooks, `.claude/settings.json`, and `.gitignore` entries
- Builds the code-review graph if selected

### Keeps itself updated

init-claude checks once a day (silent `git fetch`) whether there are new commits in this repo. If yes, it tells you. Running `init-claude update` pulls the latest version and re-installs dependencies. Adding a new tool to the ecosystem is one JSON edit — every machine gets it on the next update.

---

## Component catalog

| Component | Group | What it does |
|-----------|-------|-------------|
| **context-mode** | Core | Session memory + output sandbox. Cuts context waste by ~98%. |
| **sequential-thinking** | Core | Structured reasoning for architecture and design decisions. |
| **code-review-graph** | Analysis | Codebase dependency graph: impact analysis, multi-file search. |
| **serena** | Analysis | Semantic LSP: go-to-definition, find-references, precise symbol search. |
| **playwright** | Web | Browser automation, scraping, E2E testing via MCP. |
| **context7** | Web | Up-to-date library docs (React, Next.js, FastAPI…) fetched at runtime. |
| **claude-flow** | Orchestration | Multi-agent swarm / hive-mind for large parallel tasks. |
| **SuperClaude** | Orchestration | 30 `/sc:*` workflow slash commands. |
| **husky + lint-staged** | Git | Pre-commit hooks: lint and tests before every commit. |
| **RTK** | Optimization | Compresses Bash output 60–90% (git, npm, cargo, test runners). |
| **MarkItDown** | Documents | Converts PDF/Word/Excel/PPT to Markdown for Claude to read. |
| **Pencil** | Design | Vector design `.pen` files + pencil-to-code skill. |
| **Figma Dev Mode** | Design | Reads Figma designs (requires Figma desktop + Dev seat). |

### Project skills (`.claude/skills/`)

| Skill | For |
|-------|-----|
| `frontend-components` | Component patterns: 4 states, WCAG accessibility, performance |
| `api-design` | REST conventions: status codes, consistent errors, pagination |
| `unity-conventions` | Unity/C#: lifecycle, serialization, object pooling |
| `e2e-testing` | Robust E2E: selector priorities, no sleeps, Page Objects |
| `python-quality` | Python: type hints 3.10+, ruff, specific exceptions, async |

---

## Installation

**Option A — with auto-update (recommended)**

Requires Git and Node.js ≥ 18.

```bat
git clone https://github.com/episuarez/initialiser %LOCALAPPDATA%\init-claude
cd %LOCALAPPDATA%\init-claude
npm install --omit=dev
```

Add `%LOCALAPPDATA%\init-claude` to your user PATH. That's it.

**Option B — without Git**

Run `install.cmd`. Copies the app and updates PATH automatically. No auto-update.

---

## Usage

Run from the root of any project you want to configure:

```
init-claude                    Interactive wizard (recommended)
init-claude --yes              Apply recommended defaults without prompts
init-claude check              Doctor: show what's installed, no changes made
init-claude update             Self-update the app (git pull + npm install)
init-claude upgrade            Update installed components (npm, pipx, cargo)
init-claude add-skill <id>     Install a skill from the built-in catalog
init-claude add-skill <url>    Install a skill from any raw URL or GitHub repo
init-claude --version          Print version and exit
```

### Typical first run

```
cd my-project
init-claude
```

The wizard opens, scans your project in a few seconds, and presents the component list. The recommended ones are pre-selected — you just press Enter if you agree, or customize before confirming.

After it finishes, a note shows the manual steps left (usually just two `/plugin` commands inside Claude Code).

### Non-interactive (CI / scripts)

```bat
init-claude --yes
```

Installs everything recommended for the detected profile without any prompts.

---

## Your own rules — `user-rules.md`

On first run, init-claude creates `user-rules.md` in the app directory (next to `config.json`). Anything you write below the `---` separator is injected as a **"Reglas del usuario"** section into every `CLAUDE.md` the tool generates, in every project.

- It is gitignored: `init-claude update` (git pull) never touches it.
- Edit it once, and every future `init-claude` run picks it up automatically.
- Per-project rules still go in the `CUSTOM` block of each project's `CLAUDE.md` (also survives regeneration).

```
%LOCALAPPDATA%\init-claude\user-rules.md   ← global personal rules (all projects)
<project>\CLAUDE.md  CUSTOM block          ← rules for that project only
```

## Where session memory lives

The generated `CLAUDE.md` references context-mode session memory. The actual data is **not** stored in your project — it lives globally at:

```
~/.claude/context-mode/
├── content/     indexed tool outputs (one SQLite .db per context, hashed names)
└── sessions/    session memory (same scheme)
```

You don't browse these files directly; query them from inside Claude Code with `ctx_search` or say `ctx stats`.

## Extending the catalog

**Add a component** — edit `catalog/components.json`. No code changes needed. Fields:

```jsonc
{
  "id": "my-tool",
  "name": "My Tool",
  "group": "Analysis",
  "desc": "Short description shown in the wizard.",
  "recommendIf": ["frontend", "large"],   // profile tags (OR logic)
  "alwaysOn": false,                       // recommend regardless of profile
  "install": { "type": "npm", "pkg": "my-tool" },
  "mcp": { "name": "my-tool", "cmd": "npx -y my-tool-mcp" },
  "claudemd": "- `my-tool`: one-line hint injected into CLAUDE.md."
}
```

**Add a project skill** — drop a `.md` file in `catalog/skills/` and add a record to the `projectSkills` array in `components.json`.

**Remote skill registry** — create `config.json` in the app directory:

```json
{ "registryUrl": "https://raw.githubusercontent.com/youruser/yourrepo/main/REGISTRY.json" }
```

Point it to a JSON file with this shape:

```json
{ "skills": [{ "id": "my-skill", "desc": "What it does", "url": "https://...SKILL.md" }] }
```

The wizard will offer those skills automatically on every run.

---

## Requirements

- **Node.js** ≥ 18
- **Git** (for installation option A and auto-update)
- **Claude Code** CLI installed (`npm install -g @anthropic-ai/claude-code`)
- **Python + pipx** — optional, needed for code-review-graph, MarkItDown, SuperClaude
- **Rust + cargo** — optional, needed for RTK
- **uv** — optional, needed for serena

---

## Auto-update in detail

init-claude stores the last update-check timestamp in a local file. Once per day it runs `git fetch` silently in the background. If the remote has new commits, you see:

```
  Hay 3 actualizacion(es) de init-claude. Ejecuta: init-claude update
```

Running `init-claude update` does `git pull` + `npm install --omit=dev` and exits. The next invocation uses the new version.

`init-claude upgrade` is separate — it updates the *components* you installed (Claude Code CLI, context-mode, claude-flow, pipx packages, RTK via cargo).

---

## License

MIT with Commons Clause. Free for personal, open-source, and internal use. Attribution required on forks and derivatives. Commercial redistribution or sale requires a separate license — contact [email](mailto:11500823+episuarez@users.noreply.github.com).

See [LICENSE](./LICENSE) for full terms.

---

## Author

**Epifanio Suárez Martínez** — [email](mailto:11500823+episuarez@users.noreply.github.com)

If you fork this project, please keep the attribution. If you build something commercial on top of it, let's talk.
