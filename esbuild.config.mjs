import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const isDev = watch || process.argv.includes('--dev');

const OUT_DIR = 'dist';
const UI_TEMPLATE = 'src/ui/index.html';

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

function inject(template, css, js) {
  // Guard against an inline script terminating its own tag.
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const parts = template.split('/*__UI_CSS__*/');
  const withCss = parts.join(css);
  return withCss.split('/*__UI_JS__*/').join(safeJs);
}

/** Emits dist/ui.html with the UI script and stylesheet inlined. */
const htmlPlugin = {
  name: 'inline-html',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      const [cssText, jsText, template] = await Promise.all([
        readOptional(`${OUT_DIR}/ui.css`),
        readOptional(`${OUT_DIR}/ui.js`),
        readFile(UI_TEMPLATE, 'utf8'),
      ]);
      if (!jsText) return;
      await writeFile(`${OUT_DIR}/ui.html`, inject(template, cssText, jsText), 'utf8');
      console.log(`[build] ${OUT_DIR}/ui.html`);
    });
  },
};

if (!watch) {
  await rm(OUT_DIR, { recursive: true, force: true });
}
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  target: 'es2017',
  legalComments: 'none',
  logLevel: 'info',
  sourcemap: isDev ? 'inline' : false,
  minify: !isDev,
  define: {
    'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
  },
};

/** @type {import('esbuild').BuildOptions} */
const pluginOptions = {
  ...shared,
  entryPoints: ['src/plugin/code.ts'],
  outfile: `${OUT_DIR}/plugin.js`,
  platform: 'browser',
  format: 'iife',
  target: 'es2017',
};

/** @type {import('esbuild').BuildOptions} */
const uiOptions = {
  ...shared,
  entryPoints: ['src/ui/main.tsx'],
  outfile: `${OUT_DIR}/ui.js`,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  plugins: [htmlPlugin],
};

if (watch) {
  const contexts = await Promise.all([esbuild.context(pluginOptions), esbuild.context(uiOptions)]);
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[build] watching for changes…');
} else {
  await Promise.all([esbuild.build(pluginOptions), esbuild.build(uiOptions)]);
  console.log('[build] done');
}
