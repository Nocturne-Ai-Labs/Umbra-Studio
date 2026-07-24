#!/usr/bin/env bun
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import postcss from 'postcss';
import tailwindPostcss from '@tailwindcss/postcss';
import * as esbuild from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const frontendDir = path.join(root, 'frontend');
const srcDir = path.join(frontendDir, 'src');
const publicDir = path.join(root, 'public');
const publicAssetsDir = path.join(publicDir, 'assets');
const tempPublicDir = path.join(root, '.bun-tmp', `public-next-${process.pid}-${Date.now()}`);
const publishLockPath = path.join(root, '.bun-tmp', 'frontend-publish.lock');
let activePublicDir = publicDir;
let activePublicAssetsDir = publicAssetsDir;
const staticPublicDir = path.join(frontendDir, 'public');
const isWatch = process.argv.includes('--watch');
const isDevelopmentBuild = isWatch || process.argv.includes('--dev');
const productionOnlyAliases = new Map([
  ['framer-motion', path.join(srcDir, 'lib', 'framerMotionDisabled.tsx')],
  ['@/components/perf/RemoteTelemetryProbe', path.join(srcDir, 'components', 'remoteDisabled', 'RemoteTelemetryProbe.tsx')],
]);

function assertInsideRoot(targetPath, label) {
  const resolved = path.resolve(targetPath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`[frontend-build] Refusing to touch ${label} outside repo: ${resolved}`);
  }
  return resolved;
}

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

async function withFrontendPublishLock(callback) {
  fs.mkdirSync(path.dirname(publishLockPath), { recursive: true });
  let lockHandle = null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      lockHandle = fs.openSync(publishLockPath, 'wx');
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(publishLockPath).mtimeMs > 120_000) {
          fs.rmSync(publishLockPath, { force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
      }
      await Bun.sleep(25);
    }
  }
  if (lockHandle === null) {
    throw new Error('[frontend-build] Timed out waiting to publish the frontend build.');
  }
  try {
    return callback();
  } finally {
    fs.closeSync(lockHandle);
    fs.rmSync(publishLockPath, { force: true });
  }
}

function copyStaticPublic() {
  if (!fs.existsSync(staticPublicDir)) return;
  fs.cpSync(staticPublicDir, activePublicDir, { recursive: true, force: true });
}

async function buildCss() {
  const cssEntrypoints = [
    path.join(srcDir, 'app', 'globals.css'),
    path.join(srcDir, 'styles', 'ultra-performance.css'),
  ];
  const cssSource = cssEntrypoints
    .filter((entry) => fs.existsSync(entry))
    .map((entry) => fs.readFileSync(entry, 'utf-8'))
    .join('\n\n');

  const result = await postcss([tailwindPostcss()]).process(cssSource, {
    from: cssEntrypoints[0],
  });
  const css = isDevelopmentBuild
    ? result.css
    : (await esbuild.transform(result.css, { loader: 'css', minify: true })).code;
  const fileName = `index-${hashContent(css)}.css`;
  fs.mkdirSync(activePublicAssetsDir, { recursive: true });
  fs.writeFileSync(path.join(activePublicAssetsDir, fileName), css, 'utf-8');
  return fileName;
}

function resolveFrontendImport(specifier, importer = '') {
  const cleanSpecifier = specifier.replace(/\?raw$/, '');
  const candidateExtensions = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.txt', '.vert', '.frag', '.glsl'];
  const resolveExisting = (candidate) => {
    for (const extension of candidateExtensions) {
      const withExtension = `${candidate}${extension}`;
      if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) return withExtension;
    }
    for (const extension of candidateExtensions) {
      const indexCandidate = path.join(candidate, `index${extension}`);
      if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) return indexCandidate;
    }
    return candidate;
  };
  if (cleanSpecifier.startsWith('@/')) {
    return resolveExisting(path.join(srcDir, cleanSpecifier.slice(2)));
  }
  if (cleanSpecifier.startsWith('/')) {
    return resolveExisting(path.join(frontendDir, cleanSpecifier));
  }
  if (importer) {
    return resolveExisting(path.resolve(path.dirname(importer), cleanSpecifier));
  }
  return resolveExisting(path.resolve(frontendDir, cleanSpecifier));
}

const frontendPlugin = {
  name: 'umbra-frontend-bun',
  setup(build) {
    const packageAliases = new Map([
      ['react', 'preact/compat'],
      ['react-dom', 'preact/compat'],
      ['react-dom/client', 'preact/compat/client'],
      ['react/jsx-runtime', 'preact/jsx-runtime'],
      ['react/jsx-dev-runtime', 'preact/jsx-dev-runtime'],
    ]);

    build.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
      const alias = packageAliases.get(args.path);
      if (!alias) return undefined;
      return { path: Bun.resolveSync(alias, root) };
    });

    build.onResolve({ filter: /.*/ }, (args) => {
      if (isDevelopmentBuild) return undefined;
      const alias = productionOnlyAliases.get(args.path);
      if (!alias) return undefined;
      return { path: alias };
    });

    build.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolveFrontendImport(args.path, args.importer),
      namespace: 'raw',
    }));

    build.onResolve({ filter: /^@\// }, (args) => ({
      path: resolveFrontendImport(args.path, args.importer),
    }));

    build.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
      contents: `export default ${JSON.stringify(await fs.promises.readFile(args.path, 'utf-8'))};`,
      loader: 'js',
    }));

    build.onLoad({ filter: /\.css$/ }, () => ({
      contents: 'export default "";',
      loader: 'js',
    }));
  },
};

async function buildJavaScript() {
  const esbuildFrontendPlugin = {
    name: 'umbra-frontend-esbuild',
    setup(build) {
      const packageAliases = new Map([
        ['react', 'preact/compat'],
        ['react-dom', 'preact/compat'],
        ['react-dom/client', 'preact/compat/client'],
        ['react/jsx-runtime', 'preact/jsx-runtime'],
        ['react/jsx-dev-runtime', 'preact/jsx-dev-runtime'],
      ]);

      build.onResolve({ filter: /.*/ }, (args) => {
        const packageAlias = packageAliases.get(args.path);
        if (packageAlias) return { path: Bun.resolveSync(packageAlias, root) };

        if (!isDevelopmentBuild) {
          const alias = productionOnlyAliases.get(args.path);
          if (alias) return { path: alias };
        }

        if (args.path.endsWith('?raw')) {
          return { path: resolveFrontendImport(args.path, args.importer), namespace: 'raw' };
        }

        if (args.path.startsWith('@/')) {
          return { path: resolveFrontendImport(args.path, args.importer) };
        }

        if (args.kind !== 'entry-point' && args.path.startsWith('/') && !args.path.startsWith('/assets/')) {
          return { path: resolveFrontendImport(args.path, args.importer) };
        }

        return undefined;
      });

      build.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
        contents: `export default ${JSON.stringify(await fs.promises.readFile(args.path, 'utf-8'))};`,
        loader: 'js',
      }));

      build.onLoad({ filter: /\.css$/ }, () => ({
        contents: 'export default "";',
        loader: 'js',
      }));
    },
  };

  const result = await esbuild.build({
    entryPoints: [path.join(srcDir, 'main.tsx')],
    outdir: activePublicDir,
    bundle: true,
    target: ['es2020'],
    format: 'esm',
    splitting: !isDevelopmentBuild,
    minify: !isDevelopmentBuild,
    sourcemap: isDevelopmentBuild ? 'linked' : false,
    define: {
      'import.meta.env.DEV': JSON.stringify(isDevelopmentBuild),
      'import.meta.env.PROD': JSON.stringify(!isDevelopmentBuild),
      'import.meta.env.MODE': JSON.stringify(isDevelopmentBuild ? 'development' : 'production'),
      'import.meta.env.UMBRA_DEV_MODE': JSON.stringify(isDevelopmentBuild),
    },
    publicPath: '/',
    entryNames: 'assets/[name]-[hash]',
    chunkNames: 'assets/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    metafile: true,
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: {
      '.png': 'file',
      '.jpg': 'file',
      '.jpeg': 'file',
      '.gif': 'file',
      '.webp': 'file',
      '.ico': 'file',
      '.svg': 'file',
      '.txt': 'text',
    },
    plugins: [esbuildFrontendPlugin],
  });

  const mainOutputPath = Object.entries(result.metafile.outputs)
    .find(([, metadata]) => metadata.entryPoint && path.resolve(metadata.entryPoint) === path.join(srcDir, 'main.tsx'))?.[0]
    ?.replace(/\\/g, '/');
  const resolvedMainOutputPath = mainOutputPath
    ? (path.isAbsolute(mainOutputPath) ? mainOutputPath : path.resolve(process.cwd(), mainOutputPath))
    : '';
  const mainOutput = resolvedMainOutputPath
    ? path.relative(activePublicDir, resolvedMainOutputPath).replace(/\\/g, '/')
    : '';

  if (!mainOutput || mainOutput.startsWith('../') || path.isAbsolute(mainOutput) || !fs.existsSync(path.join(activePublicDir, mainOutput))) {
    throw new Error('[frontend-build] Could not locate generated main bundle.');
  }

  return mainOutput;
}

async function buildQueueWorker() {
  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'workers', 'PowerPrompterQueueWorker.ts')],
    outdir: activePublicDir,
    root: srcDir,
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: !isDevelopmentBuild,
    sourcemap: isDevelopmentBuild ? 'linked' : false,
    publicPath: '/assets/',
    naming: {
      entry: 'assets/PowerPrompterQueueWorker.js',
      asset: 'assets/[name]-[hash].[ext]',
    },
    plugins: [frontendPlugin],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('[frontend-build] Bun Power Prompter queue worker bundle failed.');
  }

  const workerOutput = path.join(activePublicAssetsDir, 'PowerPrompterQueueWorker.js');
  if (!fs.existsSync(workerOutput)) {
    throw new Error('[frontend-build] Could not locate generated Power Prompter queue worker bundle.');
  }
}

async function buildRasterFilterWorker() {
  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'workers', 'UmbraRasterFilterWorker.ts')],
    outdir: activePublicDir,
    root: srcDir,
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: !isDevelopmentBuild,
    sourcemap: isDevelopmentBuild ? 'linked' : false,
    publicPath: '/assets/',
    naming: {
      entry: 'assets/UmbraRasterFilterWorker.js',
      asset: 'assets/[name]-[hash].[ext]',
    },
    plugins: [frontendPlugin],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('[frontend-build] Bun raster filter worker bundle failed.');
  }

  const workerOutput = path.join(activePublicAssetsDir, 'UmbraRasterFilterWorker.js');
  if (!fs.existsSync(workerOutput)) {
    throw new Error('[frontend-build] Could not locate generated raster filter worker bundle.');
  }
}

async function buildCanvasEncodeWorker() {
  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'workers', 'UmbraCanvasEncodeWorker.ts')],
    outdir: activePublicDir,
    root: srcDir,
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: !isDevelopmentBuild,
    sourcemap: isDevelopmentBuild ? 'linked' : false,
    publicPath: '/assets/',
    naming: {
      entry: 'assets/UmbraCanvasEncodeWorker.js',
      asset: 'assets/[name]-[hash].[ext]',
    },
    plugins: [frontendPlugin],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('[frontend-build] Bun canvas encoder worker bundle failed.');
  }

  const workerOutput = path.join(activePublicAssetsDir, 'UmbraCanvasEncodeWorker.js');
  if (!fs.existsSync(workerOutput)) {
    throw new Error('[frontend-build] Could not locate generated canvas encoder worker bundle.');
  }
}

async function buildPsdEncodeWorker() {
  const result = await Bun.build({
    entrypoints: [path.join(srcDir, 'workers', 'UmbraPsdEncodeWorker.ts')],
    outdir: activePublicDir,
    root: srcDir,
    target: 'browser',
    format: 'esm',
    splitting: false,
    minify: !isDevelopmentBuild,
    sourcemap: isDevelopmentBuild ? 'linked' : false,
    publicPath: '/assets/',
    naming: {
      entry: 'assets/UmbraPsdEncodeWorker.js',
      asset: 'assets/[name]-[hash].[ext]',
    },
    plugins: [frontendPlugin],
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('[frontend-build] Bun PSD encoder worker bundle failed.');
  }

  const workerOutput = path.join(activePublicAssetsDir, 'UmbraPsdEncodeWorker.js');
  if (!fs.existsSync(workerOutput)) {
    throw new Error('[frontend-build] Could not locate generated PSD encoder worker bundle.');
  }
}

function sanitizeGeneratedJavaScript() {
  const assetsDir = activePublicAssetsDir;
  if (!fs.existsSync(assetsDir)) return;
  for (const entry of fs.readdirSync(assetsDir)) {
    if (!entry.endsWith('.js')) continue;
    const filePath = path.join(assetsDir, entry);
    const source = fs.readFileSync(filePath, 'utf-8');
    const sanitized = source.replace(/^\/\/ raw:.*(?:\r?\n)/gm, '');
    if (sanitized !== source) fs.writeFileSync(filePath, sanitized, 'utf-8');
  }
}

function compressProductionAssets() {
  if (isDevelopmentBuild || !fs.existsSync(activePublicAssetsDir)) return;
  const compressibleExtensions = new Set(['.css', '.js', '.json', '.svg']);
  const pending = [activePublicAssetsDir];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(filePath);
        continue;
      }
      if (!entry.isFile() || !compressibleExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const source = fs.readFileSync(filePath);
      if (source.byteLength < 1024) continue;

      const brotli = brotliCompressSync(source, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 9,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        },
      });
      const gzip = gzipSync(source, { level: 9 });
      if (brotli.byteLength < source.byteLength) fs.writeFileSync(`${filePath}.br`, brotli);
      if (gzip.byteLength < source.byteLength) fs.writeFileSync(`${filePath}.gz`, gzip);
    }
  }
}

function writeIndexHtml(cssFileName, mainBundlePath) {
  const sourceIndexPath = path.join(frontendDir, 'index.html');
  let html = fs.readFileSync(sourceIndexPath, 'utf-8');
  html = html.replace(/\s*<script\s+type="module"\s+src="\/src\/main\.tsx"><\/script>\s*/i, '\n');
  html = html.replace(
    /<\/head>/i,
    `    <link rel="stylesheet" href="/assets/${cssFileName}" />\n  </head>`,
  );
  html = html.replace(
    /<\/body>/i,
    `    <script type="module" src="/${mainBundlePath}"></script>\n  </body>`,
  );
  fs.writeFileSync(path.join(activePublicDir, 'index.html'), html, 'utf-8');
}

async function buildFrontend() {
  assertInsideRoot(publicDir, 'frontend output');
  assertInsideRoot(tempPublicDir, 'temporary frontend output');
  activePublicDir = tempPublicDir;
  activePublicAssetsDir = path.join(activePublicDir, 'assets');
  fs.rmSync(tempPublicDir, { recursive: true, force: true });
  fs.mkdirSync(tempPublicDir, { recursive: true });
  try {
    copyStaticPublic();
    const mainBundlePath = await buildJavaScript();
    await buildQueueWorker();
    await buildRasterFilterWorker();
    await buildCanvasEncodeWorker();
    await buildPsdEncodeWorker();
    const cssFileName = await buildCss();
    sanitizeGeneratedJavaScript();
    writeIndexHtml(cssFileName, mainBundlePath);
    compressProductionAssets();
    await withFrontendPublishLock(() => {
      fs.rmSync(publicDir, { recursive: true, force: true });
      fs.renameSync(tempPublicDir, publicDir);
    });
    console.log(`[frontend-build] Built with Bun -> ${toPosixPath(path.relative(root, publicDir))}`);
  } finally {
    activePublicDir = publicDir;
    activePublicAssetsDir = publicAssetsDir;
    fs.rmSync(tempPublicDir, { recursive: true, force: true });
  }
}

function watchFrontend() {
  let timer = null;
  let building = false;
  let rebuildQueued = false;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (building) {
        rebuildQueued = true;
        return;
      }
      building = true;
      try {
        await buildFrontend();
      } catch (error) {
        console.error(error);
      } finally {
        building = false;
        if (rebuildQueued) {
          rebuildQueued = false;
          schedule();
        }
      }
    }, 150);
  };

  const watchTargets = [
    path.join(frontendDir, 'index.html'),
    path.join(frontendDir, 'public'),
    srcDir,
  ].filter((target) => fs.existsSync(target));

  for (const target of watchTargets) {
    fs.watch(target, { recursive: fs.statSync(target).isDirectory() }, schedule);
  }
  console.log('[frontend-build] Watching frontend files with Bun dev bundles. Serve via the Umbra backend URL.');
}

await buildFrontend();
if (isWatch) watchFrontend();
