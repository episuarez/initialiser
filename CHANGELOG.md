# Changelog

All notable changes to init-claude are documented here.

## [1.2.0] — 2026-06-29

### Added
- **TypeScript** — full migration of `src/` and `bin/` to strict TypeScript, bundled with `tsup` to a committed `dist/`. New zod-validated catalog schema (`src/catalog.ts`) with inferred `Component` types, shared types in `src/types.ts`, and the wizard split into `src/commands/` (`wizard`, `check`, `suggest`, `migrate`). Tests migrated to **Vitest**.
- **Layered memory** — new **Memory** wizard step with levels: *Basic* always-on (`context-mode` = session + `CLAUDE.md` CUSTOM = project/shared), opt-in *Durable* (`Obsidian`) and *Semantic* (`basic-memory`). `init-claude migrate-memory <src> <dst>` copies markdown between durable stores — additive, never overwrites or deletes the source.
- **`ast-grep` (sg)** component — structural AST search and codemods; returns exact nodes instead of whole-file grep dumps (big token saver on refactors/audits).
- **19 new project skills** (26 total, gated per-stack): `typescript-quality`, `go-quality`, `rust-quality`, `accessibility-wcag`, `react-performance`, `database-schema`, `auth-security`, `tdd-unit-testing`, `error-handling`, `secure-coding`, `refactoring-safe`, `git-commit-hygiene`, `dependency-hygiene`, `observability-logging`, `performance-profiling`, `docker-optimization`, `ci-cd-pipelines`, `llm-integration`, `documentation-writing` — plus two always-on skills, `token-efficiency` and `memory-discipline`.
- **`docker` and `ai` profile tags** — Dockerfile/compose → `docker`; `openai`/`anthropic`/`langchain`/`transformers`… deps → `ai`. Gate the new infra/AI skills.
- **Per-project MCP scope** (`-s local`) and **prune** — deselecting an installed MCP on a re-run uninstalls it from *that project only* (additive, confirmed; never touches other projects or global binaries).
- Vault path **validation** (`validate: "dir"`) — rejects non-existent paths and warns when a folder has no `.obsidian`.
- Per-component install **timing** in the summary, with slow steps highlighted.
- `[ya instalado]` markers on already-present components, and conflict detection against already-installed tools.

### Changed
- **Minimal token-optimal baseline (Lean-4):** core is now `context-mode` + `RTK` + `context7` + the always-on `token-efficiency` skill. `sequential-thinking` demoted to opt-in (no token saving). Everything else is opt-in — alternatives only if you want them.
- **MCP Tool Search cost model:** with Tool Search on, an MCP's tool count no longer counts as context weight (schemas load on demand), so heavy MCPs (`serena`, `playwright`) are no longer penalized. `toolSearchState` reworked to the real **threshold** model — `ENABLE_TOOL_SEARCH=off|on|auto:N` (default `auto:10%`), not a version gate.
- **Generated `CLAUDE.md`:** discovery-only tool docs consolidated into a single index line under Tool Search; **user-added `##` sections outside the CUSTOM block are now preserved** (migrated into CUSTOM) across regenerations; **timestamped rotating backups** replace the single overwritten `.bak`.
- **Wizard UX:** the "what it is / what it does" description leads every choice; **ESC goes back** a step (instead of cancelling) in step-by-step mode; the conflict selector pre-selects a recommended option and shows full descriptions; progress bars / elapsed-second tickers on every wait.
- **Distribution:** `dist/` is committed and CI verifies it is in sync; the git-clone flow stays build-free for users (`npm install --omit=dev` + run `dist/`). `.gitattributes` forces LF on `dist/` and `esbuild` is pinned for reproducible bundles.
- **Repo hygiene:** demo GIF optimized 7.8 MB → 1.2 MB; `.gitignore` consolidated; `docs/` (personal notes) excluded from the repo.

### Fixed
- **~20s wizard freeze** — `claude mcp list` (which health-checks every server, ~20s, blocking the event loop) replaced by reading MCP names directly from `~/.claude.json` / `.mcp.json` (~2 ms).
- **Generated `CLAUDE.md` now carries its init-claude signature** — previously the file lacked the marker the wizard checks, so on every re-run it was treated as hand-written and the tool refused to regenerate it (and the doctor mislabeled it). Re-runs now update it correctly.
- Remote skill **names are sanitized** before being written to `.claude/skills/` (no path traversal).
- `TIMEOUT` now counts as a component **failure** in the summary (no longer reported as both success and failure).
- pipx `post` / `also` steps run **only on a successful install** (not when already present or after a failure).
- Conflict resolution now also considers **already-installed** tools (no more `serena` + `codebase-memory-mcp` both registered).
- Already-installed components are no longer silently re-offered or re-processed in step-by-step mode.

## [1.1.0] — 2026-06-22

### Added
- Component recommendation **tiers** (`core` / `suggested` / `available`) with `requireTags` (AND) on top of `recommendIf` (OR), and de-duplication against already-installed plugins/MCPs (no more duplicate `context-mode` plugin + standalone MCP).
- `init-claude check` token-saving section: reports MCP Tool Search state (Claude Code ≥ 2.1 / `ENABLE_TOOL_SEARCH`) and CLAUDE.md size, warning over 200 lines.
- `autoskills` component — runs `npx autoskills --yes --agent claude-code` to install curated, SHA-256-verified skills for your stack. New `project-npx` install type.
- `mcp-gateway` component (opt-in) — consolidate many MCP servers behind one endpoint.
- `mcp-code-execution` skill (user-level) — process tool output with code instead of dumping it into context.
- Install progress bar with per-component counter, elapsed-seconds ticker and live sub-process output line.
- Auto-migration: `init-claude update` converts a non-git (xcopy) install into a git clone in place, then pulls.

### Changed
- Recommendations driven by **cost asymmetry**, not project size. RTK is now always recommended (zero MCP-tool overhead) and no longer auto-installs a Rust toolchain — it skips cleanly if `cargo` is missing.
- `context7` promoted to core; `serena` gated by language **and** a sizable codebase; `claude-flow` is opt-in (pre-checked on large/monorepo only when Tool Search is on); `pencil` for design projects only.
- `install.cmd` installs via `git clone` when Git is available (auto-updatable), falling back to xcopy; re-running it reconverts an old copy.
- Wizard final note suggests the superpowers plugin and `npx skills find` for on-demand skill discovery.
- New `sizable` profile tag; dead `git-deps` tag removed.

### Fixed
- Graph build no longer hangs the wizard — `code-review-graph build` streams output with a 120s timeout and never blocks completion.
- Installs no longer freeze the progress indicator — heavy steps (`npm -g`, `pipx`, `cargo`, `npx`, `claude mcp add`) run asynchronously, keeping the event loop free so the spinner and ticker keep moving.
- Removed dead `alwaysOn` fallback in the recommendation logic.
- `MaxListenersExceededWarning` spam eliminated.

## [1.0.1] — 2026-06-10

### Changed
- README reordered for impact: hero GIF → value prop → quick install → catalog table.
- npm install added as primary installation method (`@episuarez/init-claude`).
- npm badge added to README.
- CONTRIBUTING.md and CHANGELOG.md added.
- GitHub Actions CI: catalog JSON validation + syntax check on every push.
- `--version` flag added.
- `user-rules.md`: personal rules injected into all generated `CLAUDE.md` files; gitignored.
- Skills now installed as `.claude/skills/<name>/SKILL.md` (Claude Code auto-discovery fix).
- Generated `CLAUDE.md` gains: project context section, Definition of done, session error policy, dependencies policy, secrets policy, memory path.
- Design section in generated `CLAUDE.md` only emitted when pencil/figma selected.
- Model section decoupled from hardcoded model names.

## [1.0.0] — 2026-06-10

### Added
- Full rewrite as a Node.js CLI/TUI application (replaces PowerShell v12 script).
- Interactive wizard powered by `@clack/prompts`: auto-detects project profile, pre-checks recommended components, multi-select for components and skills.
- Declarative component catalog (`catalog/components.json`) — add tools without touching code.
- Auto-update via `git fetch` (once per day, silent); `init-claude update` does `git pull + npm install`.
- `init-claude upgrade` updates installed components (npm, pipx, cargo).
- `init-claude add-skill <url|id>` installs skills from the built-in catalog or any remote URL.
- Remote skill registry via `config.json` (`registryUrl`): wizard offers extra skills from your own repo.
- `init-claude check` doctor command: shows installed tools, registered MCPs, plugins, and project files.
- `init-claude --yes` non-interactive mode for CI/scripts.
- `--version` flag.
- Skills installed as `.claude/skills/<name>/SKILL.md` (Claude Code auto-discovery layout).
- Project skills catalog: `frontend-components`, `api-design`, `unity-conventions`, `e2e-testing`, `python-quality`.
- Agent catalog: `planner`, `code-reviewer`, `bug-investigator`, `test-runner`, `designer`.
- Command catalog: `compress-claude`.
- `user-rules.md` — personal rules injected into every generated `CLAUDE.md`; gitignored, survives `update`.
- Generated `CLAUDE.md` includes: auto-detected project context, Definition of done, session error policy, dependencies policy, secrets policy, memory path documentation.
- `CLAUDE.md` design section only emitted when pencil/figma is selected.
- `CLAUDE.md` model section decoupled from hardcoded model names.
- `CUSTOM` block in generated `CLAUDE.md` survives regeneration.
- `updateGitignore` adds Claude Code tooling entries without overwriting user content.
- `git commit-msg` hook blocks AI attribution references.
- GitHub Actions CI: validates `catalog/components.json` on every push.
- `init-claude.cmd` shim: auto-bootstraps `npm install` on first run.
- LICENSE: MIT with Commons Clause (free personal/open-source use, attribution required, commercial use needs a license).

### Components in catalog (v13)
`context-mode` · `sequential-thinking` · `code-review-graph` · `serena` · `playwright` · `context7` · `claude-flow` · `SuperClaude` · `husky` · `RTK` · `MarkItDown` · `Pencil` · `Figma`
