---
name: mcp-code-execution
description: Use when a task chains several tool/MCP calls or processes large tool outputs (logs, API responses, file dumps, query results). Write code that orchestrates the calls and returns only the derived answer, instead of dumping every intermediate result into context. Based on Anthropic's "code execution with MCP" pattern (up to ~98% fewer tokens).
---

# MCP code execution — keep intermediate data out of context

## The rule

When you would otherwise make several tool calls and read each raw output, **write code that does the work and surfaces only the conclusion**. Intermediate bytes (full logs, JSON blobs, file contents, query rows) stay in the execution sandbox; only what you `console.log`/return enters the conversation.

This is the single biggest token lever for multi-step or data-heavy work — Anthropic measured end-to-end flows dropping from ~150K tokens to ~2K (98.7%).

## When to apply

- Chaining ≥2 tool/MCP calls where the output of one feeds the next.
- Any output you intend to **process** (filter, count, aggregate, parse, transform) rather than read in full.
- Large outputs: build logs, test runs, API responses, `git log`, dependency trees, page snapshots.

## How (in this environment)

- `context-mode` is the sandbox. Prefer:
  - `ctx_batch_execute` — run multiple shell commands in parallel, auto-indexed; pass `queries` to get matching sections back in one round trip.
  - `ctx_execute` / `ctx_execute_file` — derive the answer in JS/Python/shell; only what you print returns.
  - `ctx_search` — query anything already indexed instead of re-reading.
  - `ctx_fetch_and_index` — fetch URLs; raw page bytes never enter context.
- File writes still use the native editor (sandbox FS is discarded).

## Anti-patterns

- Reading a 5K-line log into context to find 3 errors → `ctx_execute` a `grep`/filter, return the 3 lines.
- Making 6 sequential MCP calls and narrating each result → one code block that orchestrates and returns the final object.
- Re-reading a file you already indexed → `ctx_search`.

## Smell test

If you are about to read a tool output **only to extract or summarize part of it**, you should be running code over it, not reading it.
