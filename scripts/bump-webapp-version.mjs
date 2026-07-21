#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const packagePath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

const match = String(pkg.version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
if (!match) {
  console.error(`Unsupported version format: ${pkg.version}`);
  process.exit(1);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

patch += 1;
if (patch > 9) {
  patch = 0;
  minor += 1;
}

const nextVersion = `${major}.${minor}.${patch}`;
const prevVersion = pkg.version;
pkg.version = nextVersion;

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
console.log(`Bumped version: ${prevVersion} -> ${nextVersion}`);
