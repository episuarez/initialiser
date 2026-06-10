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
import { installComponent, hasCmd, mcpList, installedPlugins, run } from '../src/install.mjs';
import * as gen from '../src/generate.mjs';
import * as remote from '../src/remote.mjs';

const projectDir = process.cwd();
const args = process.argv.slice(2);
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
  console.log('');
  process.exit(0);
}

// ─── WIZARD (flujo principal) ────────────────────────────────────────────────
console.clear();
p.intro(pc.bgCyan(pc.black(' init-claude v13 ')));

const s = p.spinner();
s.start('Analizando el proyecto');
const profile = detectProfile(projectDir);
const plugins = [...new Set(installedPlugins())];
const hasSuperpowers = plugins.some(x => /superpowers/i.test(x));
s.stop(`Perfil: ${pc.cyan(profile.langs.join(', ') || 'sin lenguaje')} ${profile.fws.length ? '· ' + pc.cyan(profile.fws.join(', ')) : ''} · ${profile.fileCount} archivos (${profile.size})${profile.hasDocs ? ' · docs' : ''}${profile.hasDesign ? ' · diseño' : ''}${profile.hasCI ? ' · CI' : ''}`);

// Recomendaciones segun catalogo + tags del perfil
const recommended = (c) => c.alwaysOn || (c.recommendIf ?? []).some(t => profile.tags.has(t));

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

for (const comp of selectedComps) {
  const s2 = p.spinner();
  s2.start(`${comp.name}`);
  try {
    const r = await installComponent(comp, ctx);
    const summary = r.map(([k, v]) => `${k}:${v}`).join(' ');
    const failed = r.some(([, v]) => v.startsWith('FAIL'));
    s2.stop(`${comp.name} ${failed ? pc.red(summary) : pc.green(summary)}`);
    results.push([comp.name, summary]);
    // Skills user-level asociadas (design-brief, pencil-to-code...)
    for (const us of comp.userSkills ?? []) gen.copySkillToUser(us);
  } catch (e) {
    s2.stop(`${comp.name} ${pc.red('ERROR: ' + e.message)}`);
  }
}

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
  const s5 = p.spinner();
  s5.start('Construyendo grafo del codebase');
  run('code-review-graph build');
  s5.stop('Grafo construido');
}

p.note(
  [
    'Dentro de Claude Code (una vez):',
    '  /plugin marketplace add mksglu/context-mode',
    '  /plugin install context-mode@context-mode',
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
