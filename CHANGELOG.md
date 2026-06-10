# Changelog

All notable changes to init-claude are documented here.

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
