import { defineConfig } from 'tsup';

// Bundle del CLI a dist/init-claude.js. Deps (clack, picocolors, zod) quedan
// externas: se instalan con `npm install --omit=dev` en el clon del usuario.
// El dist/ se commitea (la distribucion es git-clone sin build en casa).
export default defineConfig({
  entry: { 'init-claude': 'bin/init-claude.ts' },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: false,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
});
