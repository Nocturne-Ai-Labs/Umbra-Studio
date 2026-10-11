import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { HostNodeRuntime } from '../shared/hostNodeRuntime';
import { ownedPath } from './ComfyPythonRuntime';
import { relative } from 'node:path';

export function ensureAIToolkitSqlite(runtimeRoot: string, ui: string, runtime: HostNodeRuntime, log: (line: string) => void): void {
  const packageRoot = join(ui, 'node_modules', 'sqlite3');
  if (!existsSync(join(packageRoot, 'package.json'))) return;
  const probe = (cwd: string) => spawnSync(runtime.executable, ['-e', "const s=require('sqlite3');const db=new s.Database(':memory:');db.get('SELECT 1 AS value',(error,row)=>{if(error||row.value!==1)process.exitCode=1;db.close();});"],
    { cwd, env: runtime.env, encoding: 'utf8', timeout: 30000 });
  const initial = probe(ui);
  if (initial.status === 0) return;
  const failure = String(initial.stderr || '');
  const missingBinding = !existsSync(join(packageRoot, 'build', 'Release', 'node_sqlite3.node')) && /Could not locate the bindings file/.test(failure);
  if (!missingBinding && !/GLIBC_\d|GLIBCXX_\d|CXXABI_\d/.test(failure)) throw new Error(String(initial.stderr || initial.error?.message || 'SQLite native probe failed.').slice(-2000));
  const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('SQLite package identity could not be verified before native repair.');
  // node-gyp's Makefiles cannot safely build inside the standard "Umbra Studio"
  // path. Build only this exact addon in an owned, space-free temporary directory.
  const temporaryRoot = realpathSync(tmpdir());
  const scratch = mkdtempSync(join(temporaryRoot, 'umbra-sqlite-'));
  if (/\s/.test(scratch)) throw new Error(`A space-free temporary directory is required for SQLite repair: ${scratch}`);
  let complete = false;
  try {
    writeFileSync(join(scratch, 'package.json'), JSON.stringify({ name: 'umbra-sqlite-native-build', version: '1.0.0', private: true, dependencies: { sqlite3: version } }));
    log(`Rebuilding SQLite ${version} for this Linux system in ${scratch}.`);
    const built = spawnSync(runtime.executable, [runtime.npmCli, 'install', '--build-from-source', '--no-audit', '--no-fund'],
      { cwd: scratch, env: runtime.env, stdio: 'inherit', timeout: 15 * 60_000 });
    if (built.status !== 0 || probe(scratch).status !== 0) throw new Error(`SQLite native build failed; retained ${scratch}. Install C++ build tools, make and Python 3, then retry.`);
    const binary = join(scratch, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node');
    if (!lstatSync(binary).isFile() || lstatSync(binary).isSymbolicLink()) throw new Error('SQLite native build produced an unverified file.');
    const destination = ownedPath(runtimeRoot, relative(runtimeRoot, packageRoot), 'build', 'Release', 'node_sqlite3.node');
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(binary, destination);
    if (probe(ui).status !== 0) throw new Error(`SQLite native verification failed after repair; retained ${scratch}.`);
    complete = true;
    log('SQLite native binding rebuilt and its in-memory query verified.');
  } finally {
    if (complete && dirname(scratch) === temporaryRoot && !lstatSync(scratch).isSymbolicLink()) rmSync(scratch, { recursive: true, force: true });
  }
}
