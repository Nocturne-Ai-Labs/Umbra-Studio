import { spawnSync } from 'node:child_process';

const COMPILER_PROBE = String.raw`
import json, shlex, shutil, sysconfig
def available(key):
    command = shlex.split(sysconfig.get_config_var(key) or '')
    return bool(command and shutil.which(command[0]))
print(json.dumps({'ccAvailable': available('CC'), 'cxxAvailable': available('CXX'),
                 'gcc': shutil.which('gcc'), 'gxx': shutil.which('g++')}))
`;

// Standalone Python records its build compiler, which may not be installed on
// the target Linux host. Use existing build-essential tools only when needed.
export function linuxNodeCompilerEnvironment(
  python: string, env: NodeJS.ProcessEnv = process.env, platform: string = process.platform,
  log: (message: string) => void = () => {},
): NodeJS.ProcessEnv {
  if (platform !== 'linux' || env.CC?.trim()) return env;
  const result = spawnSync(python, ['-I', '-B', '-c', COMPILER_PROBE], {
    env, encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  try {
    if (result.status !== 0) return env;
    const probe = JSON.parse(result.stdout);
    const next = { ...env };
    if (probe.ccAvailable === false && typeof probe.gcc === 'string' && probe.gcc) {
      next.CC = probe.gcc;
    }
    if (!env.CXX?.trim() && probe.cxxAvailable === false && typeof probe.gxx === 'string' && probe.gxx) {
      next.CXX = probe.gxx;
    }
    if (next.CC !== env.CC || next.CXX !== env.CXX) {
      log('Managed Python compiler is unavailable; using existing GCC/G++ for Linux node dependency builds.');
      return next;
    }
    if (probe.ccAvailable === false) {
      log('Managed Python native compiler is unavailable. Dependencies needing a source build require a compatible CC/CXX toolchain; pip configuration was retained.');
    }
  } catch { /* Keep pip's normal compiler configuration when inspection fails. */ }
  return env;
}
