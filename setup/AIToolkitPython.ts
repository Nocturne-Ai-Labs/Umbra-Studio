import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, toNamespacedPath } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

function run(python: string, args: string[], cwd: string, log: (line: string) => void, timeout = 30 * 60_000): string {
  const installing = args[0] === '-m' && args[1] === 'pip' && args[2] === 'install';
  // PyTorch's deeply nested license files need extended paths. General wheel
  // installers also write ../Scripts entries, which require normal path semantics.
  const result = spawnSync(process.platform === 'win32' && installing && args.includes('--index-url') ? toNamespacedPath(python) : python, args, { cwd, stdio: installing ? 'inherit' : 'pipe', encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 32 * 1024 * 1024 });
  if (result.stdout) log(result.stdout);
  if (result.stderr) log(result.stderr);
  if (result.status !== 0) throw new Error(`AI Toolkit runtime check/install failed: ${result.error?.message || result.stderr?.slice(-2000) || result.status}`);
  return (result.stdout || '').trim();
}

export function aiToolkitTorchPins(tool: string, python: string): Record<string, string> {
  const spec = join(tool, 'manager', 'spec.py');
  if (!existsSync(spec)) throw new Error('This AI Toolkit checkout predates its reviewed runtime specification. Update AI Toolkit in Umbra Setup, then use Update Python 3.12. The previous environment was preserved.');
  const script = "import ast,json,sys; tree=ast.parse(open(sys.argv[1],encoding='utf-8').read()); values=[ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TORCH' for t in n.targets)]; assert len(values)==1; classes=[n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='EnvSpec']; defaults=[ast.literal_eval(d) for c in classes for n in c.body if isinstance(n,ast.FunctionDef) and n.name=='__init__' for a,d in zip(n.args.args[-len(n.args.defaults):],n.args.defaults) if a.arg=='python_version']; assert not defaults or defaults==['3.12'], 'AI Toolkit Python target changed; update Umbra Setup'; print(json.dumps(values[0]))";
  const pins = JSON.parse(run(python, ['-I', '-c', script, spec], tool, () => {}, 10_000));
  if (!pins || Object.keys(pins).sort().join(',') !== 'torch,torchaudio,torchvision' || Object.values(pins).some(value => typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value))) throw new Error('Unsupported AI Toolkit PyTorch specification. Update Umbra Setup before retrying.');
  return pins;
}

export function aiToolkitRequirementsFingerprint(tool: string): string {
  if (!existsSync(join(tool, 'requirements.txt'))) return '';
  const inputs = ['requirements.txt', 'requirements_base.txt', 'manager/spec.py'].filter(name => existsSync(join(tool, name)));
  return createHash('sha256').update(inputs.map(name => `${name}\n${readFileSync(join(tool, name), 'utf8')}`).join('\n')).digest('hex');
}

export function aiToolkitRequirementsVerified(tool: string): boolean {
  const marker = join(tool, '.requirements_installed');
  const fingerprint = aiToolkitRequirementsFingerprint(tool);
  return !!fingerprint && existsSync(marker) && readFileSync(marker, 'utf8').trim() === fingerprint && existsSync(join(tool, '.torch_installed'));
}

export function installAIToolkitPythonDependencies(tool: string, python: string, gpu: string, log: (line: string) => void): boolean {
  const pins = aiToolkitTorchPins(tool, python);
  const requirements = join(tool, 'requirements.txt');
  if (!existsSync(requirements)) throw new Error('AI Toolkit requirements are missing. Repair its checkout in Setup.');
  run(python, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], tool, log);
  const nvidia = /nvidia/i.test(gpu);
  const indexes = nvidia ? ['cu130', 'cu126'] : ['cpu'];
  let selected = '';
  for (const backend of indexes) {
    try {
      log(`Installing AI Toolkit's upstream-pinned PyTorch stack (${backend})`);
      run(python, ['-m', 'pip', 'install', '--upgrade', ...['torch', 'torchvision', 'torchaudio'].map(name => `${name}==${pins[name]}+${backend}`), '--index-url', `https://download.pytorch.org/whl/${backend}`], tool, log);
      run(python, ['-c', 'import torch,torchvision,torchaudio; ' + (nvidia ? "assert torch.cuda.is_available(); x=torch.ones(1,device='cuda'); assert float((x+x).cpu()[0])==2" : "print(torch.__version__)" )], tool, log, 90_000);
      selected = backend; break;
    } catch (error) { log(String(error)); }
  }
  if (!selected) throw new Error('No compatible AI Toolkit PyTorch runtime passed verification.');
  const versions = JSON.parse(run(python, ['-c', "import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ('torch','torchvision','torchaudio')}))"], tool, () => {}, 30_000));
  const constraint = join(tool, '.umbra-torch-constraints.txt');
  writeFileSync(constraint, Object.entries(versions).map(([name, version]) => `${name}==${version}`).join('\n') + '\n');
  // Constraints and per-package wheel pages preserve CUDA without making the CUDA
  // repository the source for unrelated dependencies.
  run(python, ['-m', 'pip', 'install', '-r', requirements, '-c', constraint, ...Object.keys(versions).flatMap(name => ['--find-links', `https://download.pytorch.org/whl/${selected}/${name}/`])], tool, log);
  verifyAIToolkitPython(tool, python, gpu, log);
  writeFileSync(join(tool, '.torch_installed'), `${versions.torch}|${selected}`);
  writeFileSync(join(tool, '.requirements_installed'), aiToolkitRequirementsFingerprint(tool));
  return true;
}

export function verifyAIToolkitPython(tool: string, python: string, gpu: string, log: (line: string) => void): void {
  const script = "import sys,ssl,torch,torchvision,torchaudio,scipy,diffusers,transformers,accelerate,peft; assert sys.version_info[:2]==(3,12); print('PYTHON='+sys.version.split()[0]); print('TORCH='+torch.__version__); print('CUDA='+str(torch.version.cuda)); "
    + (/nvidia/i.test(gpu) ? "assert torch.cuda.is_available(); w=torch.nn.Linear(4,2).cuda(); loss=w(torch.ones(2,4,device='cuda')).square().mean(); loss.backward(); assert all(torch.isfinite(p.grad).all() for p in w.parameters()); torch.optim.AdamW(w.parameters()).step(); print('TRAINING_CUDA_OK'); " : '');
  run(python, ['-c', script], tool, log, 120_000);
  run(python, ['run.py', '--help'], tool, log, 120_000);
  run(python, ['-m', 'pip', 'check'], tool, log, 30_000);
}
