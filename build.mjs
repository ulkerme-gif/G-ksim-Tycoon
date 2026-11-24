// Tek dosyalık index.html üretir: node build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  minify: !process.argv.includes('--dev'),
  target: ['es2020', 'safari15'],
  loader: { '.glb': 'binary', '.jpg': 'dataurl' },
  write: false,
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/style.css', 'utf8');
const html = readFileSync('src/index.html', 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
writeFileSync('index.html', html);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
