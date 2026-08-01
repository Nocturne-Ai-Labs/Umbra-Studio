#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version || '0.0.0').replace(/[^0-9.].*$/, '');
const parts = version.split('.').map((entry) => Number.parseInt(entry, 10) || 0);
const assemblyVersion = `${parts[0] || 0}.${parts[1] || 0}.${parts[2] || 0}.0`;
const sourceTemplate = fs.readFileSync(path.join(root, 'launcher', 'windows', 'UmbraStudioLauncher.cs'), 'utf8');
const generatedRoot = path.join(root, 'dist-webapp', 'windows-launcher');
const generatedSource = path.join(generatedRoot, 'UmbraStudioLauncher.generated.cs');
const outputPath = path.join(root, 'dist-webapp', 'UmbraStudio.exe');
const iconPath = path.join(root, 'frontend', 'public', 'assets', 'UMBRA.ico');
const manifestPath = path.join(root, 'launcher', 'windows', 'UmbraStudio.manifest');
const frameworkRoot = process.env.WINDIR || 'C:\\Windows';
const compilerCandidates = [
  path.join(frameworkRoot, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(frameworkRoot, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
];
const compiler = compilerCandidates.find((candidate) => fs.existsSync(candidate));

if (process.platform !== 'win32') throw new Error('The Windows launcher can only be built on Windows.');
if (!compiler) throw new Error('The .NET Framework C# compiler was not found.');
if (!fs.existsSync(iconPath)) throw new Error(`Umbra icon is missing: ${iconPath}`);

fs.mkdirSync(generatedRoot, { recursive: true });
fs.writeFileSync(
  generatedSource,
  sourceTemplate
    .replaceAll('__UMBRA_ASSEMBLY_VERSION__', assemblyVersion)
    .replaceAll('__UMBRA_VERSION__', String(packageJson.version || assemblyVersion)),
  'utf8',
);

const result = spawnSync(compiler, [
  '/nologo',
  '/target:winexe',
  '/platform:x64',
  '/optimize+',
  '/reference:System.dll',
  '/reference:System.Windows.Forms.dll',
  `/win32icon:${iconPath}`,
  `/win32manifest:${manifestPath}`,
  `/out:${outputPath}`,
  generatedSource,
], { cwd: root, encoding: 'utf8' });

if (result.status !== 0) {
  throw new Error(`Windows launcher build failed.\n${result.stdout || ''}\n${result.stderr || ''}`.trim());
}

const bytes = fs.statSync(outputPath).size;
if (bytes <= 0 || bytes > 2 * 1024 * 1024) {
  throw new Error(`Unexpected Windows launcher size: ${bytes} bytes.`);
}
console.log(`[windows-launcher] Built ${outputPath} (${bytes} bytes).`);
