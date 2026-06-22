#!/usr/bin/env node
// bin/init-claude.mjs — Entry point. Wizard TUI por defecto.
//
// Comandos:
//   init-claude              Wizard interactivo (detecta + recomienda + eliges)
//   init-claude check        Doctor: estado de todo, sin instalar
//   init-claude update       Self-update (git pull + npm install)
//   init-claude upgrade      Actualiza componentes instalados
//   init-claude add-skill <url|id>   Instala una skill (catalogo, registro o URL)
//   init-claude --yes        Acepta recomendaciones sin wizard

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectProfile } from '../src/detect.mjs';
import { installComponent, hasCmd, mcpList, installedPlugins, run, toolSearchState } from '../src/install.mjs';
import * as gen from '../src/generate.mjs';
import * as remote from '../src/remote.mjs';

const projectDir = process.cwd();
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');
  console.log(`init-claude v${version}`);
  process.exit(0);
}

const cmd = args[0]?.startsWith('-') ? null : args[0];
const flagYes = args.includes('--yes') || args.includes('-y');

const catalog = JSON.parse(readFileSync(join(gen.CATALOG_DIR, 'components.json'), 'utf8'));

// user-rules.md: reglas personales inyectadas en cada CLAUDE.md generado.
gen.ensureUserRulesFile();

// ─── Aviso de updates (silencioso, 1/dia) ───────────────────────────────────
const pending = remote.checkUpdatesQuiet();
if (pending > 0) {
  console.log(pc.yellow(`\n  Hay ${pending} actualizacion(es) de init-claude. Ejecuta: init-claude update\n`));
}

// ─── Comandos directos ───────────────────────────────────────────────────────
if (cmd === 'update') {
  const r = remote.selfUpdate();
  console.log(r.ok ? pc.green(r.msg) : pc.red(r.msg));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === 'upgrade') {
  console.log(pc.cyan('\nUpgrade de componentes instalados...\n'));
  if (hasCmd('claude')) run('npm update -g @anthropic-ai/claude-code', { visible: true });
  run('npm update -g context-mode', { visible: true });
  if (hasCmd('claude-flow')) run('npm install -g claude-flow@alpha', { visible: true });
  if (hasCmd('pipx')) run('pipx upgrade-all', { visible: true });
  if (hasCmd('rtk') && hasCmd('cargo')) run('cargo install --git https://github.com/rtk-ai/rtk --locked --force', { visible: true });
  console.log(pc.green('\nHecho. MCPs npx -y usan @latest al arrancar.\n'));
  process.exit(0);
}

if (cmd === 'add-skill') {
  const target = args[1];
  if (!target) { console.log(pc.red('Uso: init-claude add-skill <url|id-del-catalogo>')); process.exit(1); }
  if (/^https?:\/\//.test(target)) {
    try {
      const { name, content } = await remote.fetchSkill(target);
      const r = gen.writeSkill(projectDir, name, content);
      console.log(pc.green(`Skill '${name}': ${r} (.claude/skills/${name}/SKILL.md)`));
    } catch (e) { console.log(pc.red(`Error: ${e.message}`)); process.exit(1); }
  } else {
    const r = gen.copySkillToProject(target, projectDir);
    console.log(r === 'MISSING' ? pc.red(`'${target}' no esta en el catalogo`) : pc.green(`Skill '${target}': ${r}`));
  }
  process.exit(0);
}

if (cmd === 'check') {
  console.log(pc.cyan('\n══ Estado del sistema ══\n'));
  const checks = [
    ['Node.js', hasCmd('node')], ['Python', hasCmd('python')], ['Git', hasCmd('git')],
    ['Rust/cargo', hasCmd('cargo')], ['claude CLI', hasCmd('claude')],
    ['context-mode', hasCmd('context-mode')], ['code-review-graph', hasCmd('code-review-graph')],
    ['markitdown', hasCmd('markitdown')], ['rtk', hasCmd('rtk')], ['pipx', hasCmd('pipx')], ['uv', hasCmd('uv')],
  ];
  for (const [n, ok] of checks) console.log(`  ${ok ? pc.green('[x]') : pc.red('[ ]')} ${n}`);
  console.log(pc.cyan('\nMCPs registrados:'));
  for (const m of mcpList()) console.log(pc.green(`  - ${m}`));
  console.log(pc.cyan('\nPlugins:'));
  for (const pl of [...new Set(installedPlugins())]) console.log(pc.green(`  - ${pl}`));
  console.log(pc.cyan('\nProyecto:'));
  for (const f of ['CLAUDE.md', '.claude/settings.json', '.claude/skills', '.git/hooks/commit-msg'])
    console.log(`  ${existsSync(join(projectDir, f)) ? pc.green('[x]') : pc.gray('[ ]')} ${f}`);

  // Ahorro de tokens: estado de MCP Tool Search (mayor palanca 2026)
  console.log(pc.cyan('\nAhorro de tokens:'));
  const ts = toolSearchState();
  const tsIcon = ts.on === true ? pc.green('[x]') : ts.on === false ? pc.red('[ ]') : pc.gray('[?]');
  console.log(`  ${tsIcon} MCP Tool Search ${pc.gray('(' + ts.reason + ')')}`);
  if (ts.on === false) console.log(pc.yellow('      Actívalo: export ENABLE_TOOL_SEARCH=1 (o actualiza Claude Code a >=2.1). ~85% menos overhead de tools.'));

  // Tamano del CLAUDE.md del proyecto (recomendado <200 lineas; skills cargan on-demand)
  const mdPath = join(projectDir, 'CLAUDE.md');
  if (existsSync(mdPath)) {
    const txt = readFileSync(mdPath, 'utf8');
    const lines = txt.split('\n').length;
    const approxTok = Math.round(txt.length / 4);
    const big = lines > 200;
    console.log(`  ${big ? pc.yellow('[!]') : pc.green('[x]')} CLAUDE.md: ${lines} lineas, ~${approxTok} tokens`);
    if (big) console.log(pc.yellow('      >200 lineas: mueve lo especifico a skills (.claude/skills/, cargan on-demand).'));
  }
  console.log('');
  process.exit(0);
}

// ─── WIZARD (flujo principal) ────────────────────────────────────────────────
// @clack/prompts registra signal/exit listeners por cada spinner sin limpiarlos;
// con varios spinners se supera el limite por defecto (10) y Node avisa. Subimos el techo.
process.setMaxListeners(50);
console.clear();
p.intro(pc.bgCyan(pc.black(' init-claude v1 ')));

const s = p.spinner();
s.start('Analizando el proyecto');
const profile = detectProfile(projectDir);
const plugins = [...new Set(installedPlugins())];
const hasSuperpowers = plugins.some(x => /superpowers/i.test(x));
const toolSearch = toolSearchState();
s.stop(`Perfil: ${pc.cyan(profile.langs.join(', ') || 'sin lenguaje')} ${profile.fws.length ? '· ' + pc.cyan(profile.fws.join(', ')) : ''} · ${profile.fileCount} archivos (${profile.size})${profile.hasDocs ? ' · docs' : ''}${profile.hasDesign ? ' · diseño' : ''}${profile.hasCI ? ' · CI' : ''}`);

if (toolSearch.on === false)
  p.log.warn(`MCP Tool Search OFF (${toolSearch.reason}). Actívalo con ENABLE_TOOL_SEARCH=1 o Claude Code >=2.1: ~85% menos overhead de tools.`);

// Capacidades ya provistas por plugins instalados o MCPs registrados: no las re-recomendamos
// (evita duplicar tools, p.ej. plugin context-mode + MCP context-mode standalone).
const provided = new Set([...plugins, ...mcpList()].map(x => x.toLowerCase()));
const alreadyProvided = (c) =>
  [c.id, c.mcp?.name, c.install?.bin].filter(Boolean).some(n => provided.has(String(n).toLowerCase()));

// Recomendacion por tier (asimetria de coste) + aplicabilidad:
//   core      -> siempre (salvo ya provisto)
//   suggested -> recommendIf (OR) Y requireTags (AND)
//   available -> nunca pre-marcado (opt-in)
const recommended = (c) => {
  if (alreadyProvided(c)) return false;
  const tier = c.tier ?? (c.alwaysOn ? 'core' : 'suggested');
  if (tier === 'core') return true;
  if (tier === 'available') {
    // Con Tool Search on el schema de tools deja de pesar: relajamos algunos opt-in pesados.
    return toolSearch.on === true && (c.recommendIfToolSearch ?? []).some(t => profile.tags.has(t));
  }
  const orOk = (c.recommendIf ?? []).some(t => profile.tags.has(t));
  const andOk = (c.requireTags ?? []).every(t => profile.tags.has(t));
  return orOk && andOk;
};

let selectedIds, projectSkillIds, extraContent = null;

if (flagYes) {
  selectedIds = catalog.components.filter(recommended).map(c => c.id);
  projectSkillIds = catalog.projectSkills.filter(recommended).map(s2 => s2.id);
} else {
  // ── Paso 1: componentes (multiselect agrupado, recomendados pre-marcados)
  const options = catalog.components.map(c => ({
    value: c.id,
    label: `${c.name} ${pc.gray(`(${c.group})`)}`,
    hint: c.desc + (recommended(c) ? pc.green(' · recomendado') : ''),
  }));
  const sel = await p.multiselect({
    message: 'Componentes a instalar (espacio marca, enter confirma):',
    options,
    initialValues: catalog.components.filter(recommended).map(c => c.id),
    required: false,
  });
  if (p.isCancel(sel)) { p.cancel('Cancelado.'); process.exit(0); }
  selectedIds = sel;

  // ── Paso 2: skills de proyecto
  if (catalog.projectSkills.length) {
    const skillSel = await p.multiselect({
      message: 'Skills de proyecto (.claude/skills/):',
      options: catalog.projectSkills.map(s2 => ({
        value: s2.id, label: s2.id,
        hint: s2.desc + (recommended(s2) ? pc.green(' · recomendado') : ''),
      })),
      initialValues: catalog.projectSkills.filter(recommended).map(s2 => s2.id),
      required: false,
    });
    if (p.isCancel(skillSel)) { p.cancel('Cancelado.'); process.exit(0); }
    projectSkillIds = skillSel;
  } else projectSkillIds = [];

  // ── Paso 3: contenido adicional
  const wantsExtra = await p.confirm({ message: 'Añadir algo mas? (skill desde URL, notas para CLAUDE.md)', initialValue: false });
  if (!p.isCancel(wantsExtra) && wantsExtra) {
    const what = await p.select({
      message: 'Que quieres añadir?',
      options: [
        { value: 'url',   label: 'Skill desde URL (raw .md o repo GitHub)' },
        { value: 'notes', label: 'Notas/reglas adicionales para el CLAUDE.md' },
        { value: 'none',  label: 'Nada, continuar' },
      ],
    });
    if (!p.isCancel(what)) {
      if (what === 'url') {
        const url = await p.text({ message: 'URL de la skill:' });
        if (!p.isCancel(url) && url) {
          try {
            const { name, content } = await remote.fetchSkill(url);
            gen.writeSkill(projectDir, name, content);
            p.log.success(`Skill '${name}' descargada al proyecto.`);
            projectSkillIds.push(name);
          } catch (e) { p.log.error(`No se pudo descargar: ${e.message}`); }
        }
      } else if (what === 'notes') {
        const notes = await p.text({ message: 'Notas (una linea; para mas, edita el bloque CUSTOM del CLAUDE.md despues):' });
        if (!p.isCancel(notes) && notes) extraContent = notes;
      }
    }
  }

  // ── Registro remoto opcional (skills extra publicadas en tu repo)
  const regUrl = remote.getRegistryUrl();
  if (regUrl) {
    const reg = await remote.fetchRegistry(regUrl);
    if (reg?.skills?.length) {
      const regSel = await p.multiselect({
        message: 'Skills extra de tu registro remoto:',
        options: reg.skills.map(sk => ({ value: sk.url, label: sk.id, hint: sk.desc })),
        required: false,
        initialValues: [],
      });
      if (!p.isCancel(regSel)) {
        for (const url of regSel) {
          try {
            const { name, content } = await remote.fetchSkill(url);
            gen.writeSkill(projectDir, name, content);
            projectSkillIds.push(name);
          } catch (e) { p.log.error(`${url}: ${e.message}`); }
        }
      }
    }
  }

  const go = await p.confirm({ message: `Instalar ${selectedIds.length} componentes + ${projectSkillIds.length} skills?` });
  if (p.isCancel(go) || !go) { p.cancel('Cancelado.'); process.exit(0); }
}

// ─── EJECUCION ────────────────────────────────────────────────────────────────
const selectedComps = catalog.components.filter(c => selectedIds.includes(c.id));
const ctx = { projectDir, hasPython: hasCmd('python') };
const results = [];

const bar = (done, total) => {
  const w = 20, fill = total ? Math.round((done / total) * w) : w;
  return `[${'█'.repeat(fill)}${'░'.repeat(w - fill)}] ${done}/${total}`;
};

const totalComps = selectedComps.length;
const sInstall = p.spinner();
sInstall.start(`Instalando componentes ${bar(0, totalComps)}`);
for (let i = 0; i < selectedComps.length; i++) {
  const comp = selectedComps[i];
  sInstall.message(`Instalando ${bar(i, totalComps)} · ${comp.name}`);
  try {
    const r = await installComponent(comp, ctx);
    const summary = r.map(([k, v]) => `${k}:${v}`).join(' ');
    const failed = r.some(([, v]) => v.startsWith('FAIL'));
    results.push([comp.name, summary, failed]);
    // Skills user-level asociadas (design-brief, pencil-to-code...)
    for (const us of comp.userSkills ?? []) gen.copySkillToUser(us);
  } catch (e) {
    results.push([comp.name, 'ERROR: ' + e.message, true]);
  }
}
sInstall.stop(`Componentes ${bar(totalComps, totalComps)}`);
for (const [name, summary, failed] of results)
  p.log.message(`${failed ? pc.red('✗') : pc.green('✓')} ${name} ${pc.gray(summary)}`);

// Skills de proyecto
const s3 = p.spinner();
s3.start('Skills de proyecto');
const skillResults = projectSkillIds.map(id => [id, gen.copySkillToProject(id, projectDir)]);
s3.stop(`Skills: ${skillResults.map(([i, r]) => `${i}:${r}`).join(' ') || '(ninguna)'}`);

// Agentes + commands + archivos del proyecto
const s4 = p.spinner();
s4.start('Generando archivos');
const withDesigner = selectedIds.includes('pencil') || selectedIds.includes('figma');
gen.installAgents(withDesigner);
gen.installCommands();
const mdRes = gen.generateClaudeMd(projectDir, selectedComps, projectSkillIds, hasSuperpowers, extraContent, profile);
const setRes = gen.generateProjectSettings(projectDir);
const giRes = gen.updateGitignore(projectDir);
const hookRes = gen.installGitHooks(projectDir, selectedIds.includes('husky'));
gen.saveSnapshot(projectDir, { components: selectedIds, skills: projectSkillIds });
s4.stop(`CLAUDE.md:${mdRes} settings:${setRes} gitignore:${giRes} hooks:${hookRes}`);

// Build del grafo si procede
if (selectedIds.includes('code-review-graph') && hasCmd('code-review-graph')) {
  p.log.step('Construyendo grafo del codebase (code-review-graph build)...');
  const gr = run('code-review-graph build', { visible: true, timeout: 120000 });
  if (gr.ok) p.log.success('Grafo construido');
  else if (gr.timedOut) p.log.warn('Build del grafo abortado por timeout (120s). Continua; corre "code-review-graph build" a mano luego.');
  else p.log.warn(`Build del grafo fallo (exit ${gr.code}). Continua sin grafo.`);
}

p.note(
  [
    'Dentro de Claude Code (una vez):',
    '  /plugin marketplace add mksglu/context-mode',
    '  /plugin install context-mode@context-mode',
    '',
    'Skills (recomendado, sin pre-cargar de mas):',
    '  superpowers (metodologia plan-first/TDD): /plugin install superpowers',
    '  descubrir skills on-demand: npx skills find    (o: npx skills use <pkg>@<skill>)',
    '',
    'Comandos:',
    '  init-claude check     estado',
    '  init-claude update    actualizar la app desde el repo',
    '  init-claude upgrade   actualizar componentes',
    '  init-claude add-skill <url>',
  ].join('\n'),
  'Pasos manuales'
);

p.outro(pc.green('Listo.'));
