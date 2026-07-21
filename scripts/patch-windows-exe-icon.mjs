import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { rcedit } from 'rcedit';

const root = process.cwd();
const targetExe = path.resolve(root, process.argv[2] || path.join('dist-webapp', 'UmbraStudio.exe'));
const iconPath = path.resolve(root, 'frontend', 'public', 'assets', 'UMBRA.ico');
const packageJsonPath = path.resolve(root, 'package.json');

if (!fs.existsSync(targetExe)) {
  throw new Error(`[launcher-icon] Target executable not found: ${targetExe}`);
}

if (!fs.existsSync(iconPath)) {
  throw new Error(`[launcher-icon] Icon not found: ${iconPath}`);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = `${packageJson.version || '0.0.0'}.0`;

await rcedit(targetExe, {
  icon: iconPath,
  'file-version': version,
  'product-version': version,
  'version-string': {
    CompanyName: packageJson.author || 'Nocturne AI Labs',
    FileDescription: 'Umbra Studio',
    InternalName: 'UmbraStudio',
    OriginalFilename: 'UmbraStudio.exe',
    ProductName: 'Umbra Studio',
    ProductVersion: packageJson.version || '0.0.0',
  },
});

console.log(`[launcher-icon] Patched launcher resources: ${targetExe}`);
