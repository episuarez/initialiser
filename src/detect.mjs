// src/detect.mjs — Deteccion del perfil del proyecto. Devuelve tags + datos.
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const EXCLUDE = new Set(['node_modules','dist','build','out','.next','.nuxt','.cache','coverage','__pycache__','.venv','venv','target','vendor','.git','.svelte-kit']);
const CODE_EXTS = new Set(['.js','.jsx','.ts','.tsx','.py','.go','.rs','.java','.rb','.php','.cs','.swift','.kt','.vue','.svelte']);
const DOC_EXTS = new Set(['.pdf','.docx','.doc','.xlsx','.xls','.pptx','.ppt','.epub']);
const DESIGN_EXTS = new Set(['.pen','.fig']);

function walk(dir, state, depth = 0) {
  if (depth > 12) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!EXCLUDE.has(e.name)) walk(join(dir, e.name), state, depth + 1);
    } else {
      const ext = extname(e.name).toLowerCase();
      if (CODE_EXTS.has(ext)) state.fileCount++;
      if (DOC_EXTS.has(ext)) state.hasDocs = true;
      if (DESIGN_EXTS.has(ext)) state.hasDesign = true;
    }
  }
}

function readSafe(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

export function detectProfile(root) {
  const state = { fileCount: 0, hasDocs: false, hasDesign: false };
  walk(root, state);

  const tags = new Set();
  const langs = [], fws = [];
  const has = (p) => existsSync(join(root, p));

  if (has('.git')) tags.add('git');

  const size = state.fileCount < 50 ? 'small' : state.fileCount < 500 ? 'medium' : 'large';
  tags.add(size);
  if (size !== 'small') tags.add('sizable'); // valor que escala con el codebase (code-review-graph, serena)
  if (state.hasDocs) tags.add('docs');
  if (state.hasDesign) tags.add('design');

  let hasTests = false;

  if (has('package.json')) {
    langs.push('javascript'); tags.add('javascript');
    try {
      const pkg = JSON.parse(readSafe(join(root, 'package.json')));
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ');
      if (/react|next|vue|nuxt|svelte|astro|solid|qwik|remix|@angular/.test(deps)) { fws.push('frontend'); tags.add('frontend'); }
      if (/playwright|puppeteer|cypress/.test(deps)) { fws.push('e2e'); tags.add('e2e'); }
      if (/jest|vitest|mocha|jasmine|ava/.test(deps)) hasTests = true;
      if (/express|fastify|hono|koa|@nestjs/.test(deps)) { fws.push('backend-node'); tags.add('backend-node'); }
    } catch {}
  }

  for (const f of ['pyproject.toml','setup.py','requirements.txt','Pipfile']) {
    if (has(f)) {
      langs.push('python'); tags.add('python');
      const c = readSafe(join(root, f));
      if (/fastapi|django|flask|starlette|aiohttp/.test(c)) { fws.push('backend-python'); tags.add('backend-python'); }
      if (/pytest|unittest/.test(c)) hasTests = true;
      break;
    }
  }

  if (has('go.mod')) { langs.push('go'); tags.add('go'); }
  if (has('Cargo.toml')) { langs.push('rust'); tags.add('rust'); }
  if (has('pom.xml') || has('build.gradle')) { langs.push('java'); tags.add('java'); }

  // Unity
  if (has('Assets')) {
    try {
      const stack = [join(root, 'Assets')];
      let found = false;
      while (stack.length && !found) {
        const d = stack.pop();
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isFile() && e.name.endsWith('.cs')) { found = true; break; }
          if (e.isDirectory()) stack.push(join(d, e.name));
        }
      }
      if (found) { langs.push('csharp'); fws.push('unity'); tags.add('csharp'); tags.add('unity'); }
    } catch {}
  }

  for (const f of ['pnpm-workspace.yaml','lerna.json','nx.json','turbo.json','rush.json'])
    if (has(f)) { tags.add('monorepo'); break; }

  for (const d of ['.github/workflows','.gitlab-ci.yml','.circleci','Jenkinsfile','.gitea/workflows','.forgejo/workflows'])
    if (has(d)) { tags.add('ci'); break; }

  for (const t of ['tests','test','__tests__','spec','e2e','cypress'])
    if (has(t)) { hasTests = true; break; }

  for (const t of ['design','designs','assets/design','src/design'])
    if (has(t)) { tags.add('design'); break; }

  if (hasTests) tags.add('tests');
  if (hasTests && tags.has('git') && has('package.json')) tags.add('tests-node');

  return { tags, langs, fws, fileCount: state.fileCount, size, hasDocs: state.hasDocs, hasDesign: state.hasDesign, hasTests, hasGit: tags.has('git'), hasCI: tags.has('ci'), isMonorepo: tags.has('monorepo') };
}
