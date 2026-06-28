// src/commands/check.ts — Doctor: estado del sistema, sin instalar.
import pc from 'picocolors';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProfile } from '../detect.js';
import { hasCmd, mcpList, installedPlugins, toolSearchState } from '../install.js';
import * as ui from '../ui.js';
import { loadCatalog } from '../catalog.js';

export function runCheck(ctx: { projectDir: string; version: string; flagJson: boolean }): void {
  const { projectDir, version: VERSION, flagJson } = ctx;
  const catalog = loadCatalog();
  const S = ui.sym();
  const prof = detectProfile(projectDir);
  const ts = toolSearchState();
  const mcps = mcpList();
  const NON_PLUGIN = new Set(['cache', 'data', 'marketplaces']);
  const plugs = [...new Set(installedPlugins())].filter((x) => !NON_PLUGIN.has(x));
  const mdPath = join(projectDir, 'CLAUDE.md');
  const mdTxt = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : null;
  const mdLines = mdTxt ? mdTxt.split('\n').length : 0;
  const mdManaged = mdTxt ? mdTxt.includes('Auto-generado por init-claude') : false;

  const codeIntel = [
    hasCmd('code-review-graph') && 'code-review-graph',
    mcps.includes('serena') && 'serena',
    mcps.includes('codebase-memory-mcp') && 'codebase-memory-mcp',
  ].filter(Boolean) as string[];

  if (flagJson) {
    console.log(JSON.stringify({
      version: VERSION,
      runtimes: Object.fromEntries(['node', 'python', 'git', 'cargo', 'uv', 'pipx', 'claude'].map((t) => [t, hasCmd(t)])),
      tools: Object.fromEntries(['context-mode', 'rtk', 'markitdown', 'code-review-graph'].map((t) => [t, hasCmd(t)])),
      mcps, plugins: plugs,
      project: { stack: prof.langs, size: prof.size, files: prof.fileCount, claudeMd: mdTxt ? { lines: mdLines, managed: mdManaged } : null },
      toolSearch: ts, codeIntelConflict: codeIntel.length > 1 ? codeIntel : null,
    }, null, 2));
    return;
  }

  const box = (ok: boolean) => ok ? pc.green(S.boxOn) : pc.red(S.boxOff);
  const group = (title: string, rows: [string, boolean, string?][]) => {
    console.log(pc.cyan(`\n${title}`));
    const w = Math.max(...rows.map(([n]) => n.length));
    for (const [n, ok, extra] of rows) console.log(`  ${box(ok)} ${n.padEnd(w)}${extra ? pc.gray('  ' + extra) : ''}`);
  };

  console.log(pc.bold(`\n  init-claude v${VERSION} — estado del sistema`));
  group('Runtimes', [
    ['Node.js', hasCmd('node')], ['Python', hasCmd('python')], ['Git', hasCmd('git')],
    ['Rust/cargo', hasCmd('cargo')], ['uv', hasCmd('uv')], ['pipx', hasCmd('pipx')], ['Claude Code', hasCmd('claude')],
  ]);
  group('Herramientas', [
    ['context-mode', hasCmd('context-mode')], ['rtk', hasCmd('rtk')],
    ['markitdown', hasCmd('markitdown')], ['code-review-graph', hasCmd('code-review-graph')],
  ]);

  console.log(pc.cyan('\nMCPs registrados'));
  if (mcps.length) for (const m of mcps) console.log(`  ${pc.green(S.dot)} ${m}`);
  else console.log(pc.gray('  (ninguno)'));
  if (codeIntel.length > 1)
    console.log(pc.yellow(`  ${S.warn} ${codeIntel.length} herramientas de code-intelligence activas (solapan): ${codeIntel.join(', ')} — deja una.`));

  const providedNow = new Set([...mcps, ...plugs].map((x) => x.toLowerCase()));
  const coreGaps = catalog.components.filter((c) => (c.tier === 'core') &&
    !providedNow.has(c.id.toLowerCase()) &&
    !(c.mcp && mcps.includes(c.mcp.name)) &&
    !(c.install && 'bin' in c.install && c.install.bin && hasCmd(c.install.bin)) &&
    !hasCmd(c.id));
  if (coreGaps.length) {
    console.log(pc.cyan('\nRecomendado y ausente'));
    for (const c of coreGaps) console.log(pc.yellow(`  ${S.warn} ${c.name} ${pc.gray('— ' + ui.truncate(c.desc, 50))}`));
    console.log(pc.gray('      Instala con: init-claude'));
  }

  console.log(pc.cyan('\nPlugins'));
  if (plugs.length) for (const pl of plugs) console.log(`  ${pc.green(S.dot)} ${pl}`);
  else console.log(pc.gray('  (ninguno)'));

  group('Proyecto', (['CLAUDE.md', '.claude/settings.json', '.claude/skills', '.git/hooks/commit-msg'] as const)
    .map((f) => [f, existsSync(join(projectDir, f))] as [string, boolean]));

  console.log(pc.cyan('\nAhorro de tokens'));
  const tsIcon = ts.on === true ? pc.green(S.boxOn) : ts.on === false ? pc.red(S.boxOff) : pc.gray('[?]');
  console.log(`  ${tsIcon} MCP Tool Search ${pc.gray('(' + ts.reason + ')')}`);
  if (ts.on === false) console.log(pc.yellow('      Reactívalo: quita ENABLE_TOOL_SEARCH=off o usa ENABLE_TOOL_SEARCH=auto:10 (~85% menos overhead).'));
  else if (ts.on === true && ts.mode === 'auto') console.log(pc.gray(`      Schemas diferidos cuando las tools superan el ~${ts.threshold}% del contexto; el nº de tools deja de pesar.`));

  if (mdTxt) {
    const big = mdLines > 200;
    console.log(`  ${big ? pc.yellow(S.warn) : pc.green(S.boxOn)} CLAUDE.md: ${mdLines} lineas, ~${Math.round(mdTxt.length / 4)} tokens`);
    if (big) console.log(pc.yellow('      >200 lineas: mueve lo especifico a skills (.claude/skills/).'));
    if (!mdManaged) console.log(pc.yellow('      Sin firma init-claude: editado a mano o de otra fuente (no se regenerara).'));
  }
  console.log('');
}
