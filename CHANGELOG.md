# Changelog

All notable changes to init-claude are documented here.

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
