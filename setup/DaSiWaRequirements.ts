import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GGUF_REQUIREMENT = /^\s*llama-cpp-python(?:[<=>!~;\s]|$)/i;
const LLAMA_CPP_CPU_PROBE = `
import ctypes, sys
import torch  # Loads the CUDA DLLs shipped with the ComfyUI environment on Windows.
import llama_cpp
info = llama_cpp.llama_print_system_info().decode('utf-8', 'replace')
if sys.platform == 'win32':
    for feature, marker in ((39, 'AVX = 1'), (40, 'AVX2 = 1'), (41, 'AVX512 = 1')):
        if marker in info and not ctypes.windll.kernel32.IsProcessorFeaturePresent(feature):
            sys.exit(2)
`;

function hasCompatibleLlamaCpp(python: string): boolean {
  return spawnSync(python, ['-c', LLAMA_CPP_CPU_PROBE], { encoding: 'utf-8', timeout: 30_000 }).status === 0;
}

export function installDaSiWaRequirements(python: string, requirementsPath: string, markerPath: string, log: (message: string) => void): boolean {
  const requirements = readFileSync(requirementsPath, 'utf-8');
  const hash = Bun.hash(requirements).toString();
  let coreReady = false;
  try { coreReady = readFileSync(markerPath, 'utf-8').trim() === hash; } catch { /* Install or refresh the core dependencies. */ }

  if (!coreReady) {
    const tempDir = mkdtempSync(join(tmpdir(), 'umbra-dasiwa-'));
    try {
      const corePath = join(tempDir, 'requirements.txt');
      writeFileSync(corePath, requirements.split(/\r?\n/).filter((line) => !GGUF_REQUIREMENT.test(line)).join('\n'));
      const install = spawnSync(python, ['-m', 'pip', 'install', '-r', corePath], { stdio: 'inherit' });
      if (install.status !== 0) return false;
      writeFileSync(markerPath, `${hash}\n`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const installed = spawnSync(python, ['-c', 'from importlib.metadata import version; print(version("llama-cpp-python"))'], { encoding: 'utf-8' });
  const installedVersion = installed.status === 0 ? installed.stdout.trim().match(/^(\d+)\.(\d+)\.(\d+)/) : null;
  const meetsMinimum = installedVersion && (Number(installedVersion[1]) > 0 || Number(installedVersion[2]) > 3
    || (Number(installedVersion[2]) === 3 && Number(installedVersion[3]) >= 26));
  if (meetsMinimum && hasCompatibleLlamaCpp(python)) return true;

  const torch = spawnSync(python, ['-c', 'import torch; print(torch.version.cuda or "")'], { encoding: 'utf-8' });
  const cuda = torch.status === 0 ? torch.stdout.trim() : '';
  if (process.platform === 'win32' && cuda !== '13.0' && !installedVersion) {
    log('DaSiWa Director is ready; local GGUF Prompt Forge needs a matching prebuilt llama-cpp-python wheel or another Forge backend.');
    return true;
  }

  const cpuAvx512 = process.platform === 'win32'
    && spawnSync(python, ['-c', 'import ctypes; print(int(bool(ctypes.windll.kernel32.IsProcessorFeaturePresent(41))))'], { encoding: 'utf-8' }).stdout?.trim() === '1';
  const cpuAvx2 = process.platform === 'win32'
    && spawnSync(python, ['-c', 'import ctypes; print(int(bool(ctypes.windll.kernel32.IsProcessorFeaturePresent(40))))'], { encoding: 'utf-8' }).stdout?.trim() === '1';
  const needsPortableBuild = process.platform === 'win32' && !cpuAvx512;
  if (!needsPortableBuild) {
    const wheelArgs = ['-m', 'pip', 'install', 'llama-cpp-python>=0.3.26', '--only-binary=llama-cpp-python'];
    if (process.platform === 'win32') wheelArgs.push('--extra-index-url', 'https://abetlen.github.io/llama-cpp-python/whl/cu130');
    const wheel = spawnSync(python, wheelArgs, { stdio: 'inherit' });
    if (wheel.status === 0 && hasCompatibleLlamaCpp(python)) return true;
  }

  if (process.platform !== 'win32') {
    log('DaSiWa Director is ready; local GGUF Prompt Forge needs a compatible llama-cpp-python installation.');
    return true;
  }

  const nvcc = spawnSync('nvcc', ['--version'], { encoding: 'utf-8' });
  const gpuArch = nvcc.status === 0
    ? spawnSync('nvidia-smi', ['--query-gpu=compute_cap', '--format=csv,noheader'], { encoding: 'utf-8' }).stdout?.match(/^(\d+)\.(\d+)/m)
    : null;
  const cmakeArgs = [
    '-DGGML_NATIVE=OFF', '-DGGML_AVX512=OFF', '-DGGML_AVX512_VBMI=OFF',
    '-DGGML_AVX512_VNNI=OFF', '-DGGML_AVX512_BF16=OFF',
    `-DGGML_AVX2=${cpuAvx2 ? 'ON' : 'OFF'}`,
    `-DGGML_CUDA=${nvcc.status === 0 ? 'ON' : 'OFF'}`,
    ...(gpuArch ? [`-DCMAKE_CUDA_ARCHITECTURES=${gpuArch[1]}${gpuArch[2]}`] : []),
  ];
  const vswhere = join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const vs2022 = spawnSync(vswhere, ['-latest', '-products', '*', '-version', '[17.0,18.0)', '-property', 'installationPath'], { encoding: 'utf-8' });
  const buildEnv = { ...process.env,
    CMAKE_ARGS: `${process.env.CMAKE_ARGS || ''} ${cmakeArgs.join(' ')}`.trim(),
    CMAKE_BUILD_PARALLEL_LEVEL: process.env.CMAKE_BUILD_PARALLEL_LEVEL || '8',
    ...(vs2022.status === 0 && vs2022.stdout.trim() ? { CMAKE_GENERATOR: process.env.CMAKE_GENERATOR || 'Visual Studio 17 2022' } : {}),
  };
  log(`Building a CPU-compatible ${nvcc.status === 0 ? 'CUDA' : 'CPU'} llama-cpp-python runtime for local GGUF Prompt Forge.`);
  const source = spawnSync(python, [
    '-m', 'pip', 'install', '--force-reinstall', '--no-deps', '--no-cache-dir',
    '--no-binary=llama-cpp-python', meetsMinimum ? `llama-cpp-python==${installedVersion![0]}` : 'llama-cpp-python>=0.3.26',
  ], {
    stdio: 'inherit',
    env: buildEnv,
  });
  if (source.status !== 0 || !hasCompatibleLlamaCpp(python)) {
    log('DaSiWa Director is ready, but local GGUF Prompt Forge needs a CPU-compatible llama-cpp-python build. Install Windows C++ Build Tools and the CUDA Toolkit for GPU offload, then retry setup.');
  }
  return true;
}
