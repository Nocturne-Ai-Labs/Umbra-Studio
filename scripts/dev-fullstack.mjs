import { spawn } from 'node:child_process';
import os from 'node:os';

const rootDir = process.cwd();
const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun';
const lanMode = process.argv.includes('--lan') || process.env.UMBRA_DEV_LAN === '1';
const port = Number(process.env.UMBRA_PORT || 8212) || 8212;
const host = lanMode ? '0.0.0.0' : (process.env.UMBRA_HOST || process.env.HOST || '127.0.0.1');

let exiting = false;
const children = new Set();

function getPrivateLanUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      const address = String(entry.address || '').trim();
      if (!address) continue;
      if (
        address.startsWith('10.') ||
        address.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address) ||
        /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)
      ) {
        urls.push(`http://${address}:${port}`);
      }
    }
  }
  return [...new Set(urls)];
}

function spawnProcess(label, args, cwd) {
  const child = spawn(bunCommand, args, {
    cwd,
    env: {
      ...process.env,
      UMBRA_HOST: host,
      UMBRA_DEV_MODE: '1',
      UMBRA_DEV_LAN: lanMode ? '1' : (process.env.UMBRA_DEV_LAN || ''),
    },
    stdio: 'inherit',
    windowsHide: false,
  });

  children.add(child);
  child.once('exit', (code, signal) => {
    if (exiting) return;
    const exitCode = typeof code === 'number' ? code : 0;
    const reason = signal ? `${label} stopped with signal ${signal}` : `${label} exited with code ${exitCode}`;
    shutdown(exitCode === 0 ? 0 : exitCode, reason);
  });

  child.once('error', (error) => {
    if (exiting) return;
    shutdown(1, `${label} failed to start: ${error.message}`);
  });

  return child;
}

function terminateChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // best effort
  }
}

function shutdown(code, reason) {
  if (exiting) return;
  exiting = true;
  if (reason) console.log(`\n[dev:fullstack] ${reason}`);

  for (const child of children) terminateChild(child);

  setTimeout(() => {
    process.exit(code);
  }, 150);
}

process.on('SIGINT', () => shutdown(130, 'Stopping (SIGINT)...'));
process.on('SIGTERM', () => shutdown(143, 'Stopping (SIGTERM)...'));

console.log(`\nStarting Umbra Studio (Dev Mode${lanMode ? ' LAN' : ''} with Bun frontend rebuilds)`);
console.log(`Backend:  http://127.0.0.1:${port}`);
console.log(`Frontend: http://127.0.0.1:${port}`);
if (lanMode) {
  const lanUrls = getPrivateLanUrls();
  if (lanUrls.length > 0) {
    console.log('LAN URLs:');
    for (const url of lanUrls) console.log(`  ${url}`);
  } else {
    console.log('LAN mode enabled, but no private IPv4 LAN address was detected.');
  }
}
console.log('');

spawnProcess('backend', ['run', 'UmbraServer.ts'], rootDir);
spawnProcess('frontend', ['scripts/build-frontend-bun.mjs', '--watch'], rootDir);
