import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { bundledHelperPython, bundledHelperRoot, helperPolicyHash } from '../shared/bundledPythonHelpers';
import policy from '../defaults/PythonHelpers/manifest.json';

const statusCache = new Map<string, { at: number; key: string; value: ReturnType<typeof probeHelpers> }>();
function probeHelpers(runtimeRoot: string) {
  const python = bundledHelperPython(runtimeRoot);
  const result = { ready: false, modelsIncluded: false, pythonVersion: policy.pythonVersion, packages: [] as { name: string; version: string }[],
    detail: 'WD Tagger dependencies, pandas and image/ONNX utilities. Tagger models and larger PyTorch helpers are separate downloads through Setup.' };
  if (!python) return result;
  try {
    const installed = JSON.parse(readFileSync(join(bundledHelperRoot(runtimeRoot), 'installed.json'), 'utf8'));
    if (installed.policySha256 !== helperPolicyHash()) return result;
    const script = `import importlib,importlib.metadata as m,json,sys\nfor name in ${JSON.stringify(policy.modules)}: importlib.import_module(name)\nprint(json.dumps({'python':sys.version.split()[0],'packages':[{'name':name,'version':m.version(name)} for name in ${JSON.stringify(policy.packages.map(name => name.split('==')[0]))}]}))`;
    const probe = spawnSync(python, ['-I', '-B', '-c', script], { encoding: 'utf8', windowsHide: true, timeout: 15_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', HF_HUB_OFFLINE: '1', PIP_NO_INDEX: '1' } });
    if (probe.status !== 0) return result;
    const parsed = JSON.parse(probe.stdout.trim());
    result.pythonVersion = parsed.python;
    result.packages = parsed.packages;
    result.ready = parsed.python === policy.pythonVersion && policy.packages.every(pin => parsed.packages.some((item: any) => `${item.name}==${item.version}` === pin));
  } catch { /* A damaged bundle remains unverified; explicit managed Setup is available. */ }
  return result;
}

export function inspectBundledPythonHelpers(runtimeRoot: string) {
  let key = '';
  try { key = String(statSync(join(bundledHelperRoot(runtimeRoot), 'installed.json')).mtimeMs); } catch { /* Missing bundle. */ }
  const cached = statusCache.get(runtimeRoot);
  if (cached?.key === key && Date.now() - cached.at < 30_000) return cached.value;
  const value = probeHelpers(runtimeRoot);
  if (statusCache.size > 16) statusCache.clear();
  statusCache.set(runtimeRoot, { key, at: Date.now(), value });
  return value;
}
