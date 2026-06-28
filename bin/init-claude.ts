// bin/init-claude.ts — Entry point. Parsea argv y despacha al comando.
//
//   init-claude              Wizard interactivo (detecta + recomienda + eliges)
//   init-claude check        Doctor: estado de todo (--json para salida maquina)
//   init-claude suggest      Recomendador IA oficial (headless, lento)
//   init-claude update       Self-update (git pull + npm install)
//   init-claude upgrade      Actualiza componentes instalados
//   init-claude add-skill <url|id>   Instala una skill
//   init-claude --yes        Acepta recomendaciones sin wizard
import pc from 'picocolors';
import { createRequire } from 'node:module';
import { hasCmd, run } from '../src/install.js';
import * as gen from '../src/generate.js';
import * as remote from '../src/remote.js';
import * as ui from '../src/ui.js';
import { runWizard } from '../src/commands/wizard.js';
import { runCheck } from '../src/commands/check.js';
import { runSuggest } from '../src/commands/suggest.js';
import { runMigrateMemory } from '../src/commands/migrate.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json') as { version: string };
const projectDir = process.cwd();
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(`init-claude v${VERSION}`);
  process.exit(0);
}

const first = args[0];
const cmd = first && !first.startsWith('-') ? first : null;
const flagYes = args.includes('--yes') || args.includes('-y');
const flagJson = args.includes('--json');

gen.ensureUserRulesFile();

// Aviso de updates (silencioso, 1/dia)
const pending = remote.checkUpdatesQuiet();
if (pending > 0 && !flagJson)
  console.log(pc.yellow(`\n  Hay ${pending} actualizacion(es) de init-claude. Ejecuta: init-claude update\n`));

if (cmd === 'update') {
  const r = remote.selfUpdate();
  console.log(r.ok ? pc.green(r.msg) : pc.red(r.msg));
  process.exit(r.ok ? 0 : 1);
}

if (cmd === 'upgrade') {
  console.log(pc.cyan('\nUpgrade de componentes instalados...\n'));
  if (hasCmd('claude')) run('npm update -g @anthropic-ai/claude-code', { visible: true });
  run('npm update -g context-mode', { visible: true });
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
    } catch (e: any) { console.log(pc.red(`Error: ${e.message}`)); process.exit(1); }
  } else {
    const r = gen.copySkillToProject(target, projectDir);
    console.log(r === 'MISSING' ? pc.red(`'${target}' no esta en el catalogo`) : pc.green(`Skill '${target}': ${r}`));
  }
  process.exit(0);
}

if (cmd === 'migrate-memory') { process.exit(runMigrateMemory(args.slice(1))); }

if (cmd === 'check') { runCheck({ projectDir, version: VERSION, flagJson }); process.exit(0); }

if (cmd === 'suggest') { await runSuggest({ projectDir, version: VERSION }); process.exit(0); }

// Guard de terminal no interactiva: @clack necesita TTY.
if (!ui.isTTY() && !flagYes) {
  console.error(pc.red('Terminal no interactiva (sin TTY). Usa: init-claude --yes  (acepta recomendaciones sin preguntar).'));
  process.exit(1);
}

await runWizard({ projectDir, version: VERSION, flagYes });
