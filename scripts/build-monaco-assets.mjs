import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

export async function buildMonacoAssets(root, publicDir, development = false) {
  const monacoRoot = path.dirname(Bun.resolveSync('monaco-editor/package.json', root));
  const purifierDist = path.dirname(Bun.resolveSync('dompurify', root));
  const purifier = path.join(purifierDist, 'purify.es.mjs');
  const packageInfo = JSON.parse(fs.readFileSync(path.join(purifierDist, '..', 'package.json'), 'utf8'));
  const version = packageInfo.version.split('.').map(Number);
  if (version.length !== 3 || version.some(value => !Number.isInteger(value)) || version[0] < 3 || version[0] === 3 && (version[1] < 4 || version[1] === 4 && version[2] < 17)) throw new Error('The bundled editor requires patched DOMPurify 3.4.17 or newer.');
  const result = await esbuild.build({
    entryPoints: Object.fromEntries(Object.entries({
      editor: 'vs/editor/editor.main.js',
      'editor.worker': 'vs/editor/editor.worker.js',
      'json.worker': 'vs/language/json/json.worker.js',
      'typescript.worker': 'vs/language/typescript/ts.worker.js',
      'css.worker': 'vs/language/css/css.worker.js',
      'html.worker': 'vs/language/html/html.worker.js',
    }).map(([name, entry]) => [name, path.join(monacoRoot, 'esm', entry)])),
    outdir: path.join(publicDir, 'assets', 'monaco'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: !development,
    legalComments: 'external',
    metafile: true,
    loader: { '.ttf': 'file' },
    plugins: [{
      name: 'patched-monaco-sanitizer',
      setup(build) {
        build.onResolve({ filter: /^\.\/dompurify\/dompurify\.js$/ }, args => {
          if (args.importer.replace(/\\/g, '/').endsWith('/monaco-editor/esm/vs/base/browser/domSanitize.js')) return { path: purifier };
        });
      },
    }],
  });
  const inputs = Object.keys(result.metafile.inputs).map(value => value.replace(/\\/g, '/'));
  if (inputs.some(value => value.endsWith('/browser/dompurify/dompurify.js')) || !inputs.some(value => value.endsWith('/dompurify/dist/purify.es.mjs'))) throw new Error('The editor build did not use the patched sanitizer.');
  const outputDir = path.join(publicDir, 'assets', 'monaco');
  fs.copyFileSync(path.join(monacoRoot, 'LICENSE'), path.join(outputDir, 'monaco-LICENSE.txt'));
  fs.copyFileSync(path.join(purifierDist, '..', 'LICENSE'), path.join(outputDir, 'dompurify-LICENSE.txt'));
  return { ...result, sanitizerVersion: packageInfo.version };
}
