/**
 * Tool Setup Script - Auto-installs and configures tools
 * 
 * Features:
 * - Git clones missing repositories
 * - Interactive Updates: Checks for git updates & asks user
 * - Creates Python venvs
 * - Installs PyTorch (CUDA) + requirements
 * - Respects existing installations (skipped if detected)
 */

import { join, basename, dirname, relative } from 'path';
import { existsSync, readdirSync, statSync, lstatSync, unlinkSync, rmSync, mkdirSync, readFileSync, writeFileSync, cpSync, renameSync, symlinkSync } from 'fs';
import { spawn, spawnSync, execSync } from 'child_process';

const ROOT_DIR = process.env.UMBRA_ROOT || import.meta.dir;
const TOOLS_DIR = join(ROOT_DIR, 'Tools');
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const RUNTIME_DIR = join(ROOT_DIR, 'Runtime');
const PORTABLE_PY311_HOME = join(RUNTIME_DIR, 'Python311');
const PYTHON_HELPERS_DIR = join(RUNTIME_DIR, 'PythonHelpers');
const PYTHON_HELPER_PACKAGES = [
    'onnxruntime',
    'pandas',
    'huggingface_hub',
    'pillow',
    'numpy',
    'torch',
    'transformers>=4.57,<6'
];

// Configuration
interface BaseToolConfig {
    id: string;
    name: string;
    dir: string;
    search: string[];
}

interface ToolConfig extends BaseToolConfig {
    repo?: string;
    branch?: string;
    isPipPackage?: boolean;
    pipPackage?: string;
    isStandalone?: boolean;
}

const CONFIG: Record<string, ToolConfig> = {
    comfyui: {
        id: 'comfyui',
        name: 'ComfyUI',
        dir: 'ComfyUI',
        repo: 'https://github.com/comfyanonymous/ComfyUI.git',
        branch: 'master',
        search: ['comfyui', 'comfy']
    },
    aitoolkit: {
        id: 'aitoolkit',
        name: 'AI-Toolkit',
        dir: 'AI-Toolkit',
        repo: 'https://github.com/ostris/ai-toolkit.git',
        branch: 'main',
        search: ['ai-toolkit', 'aitoolkit']
    },
};

const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

interface VerifyFailureState {
    code: string;
    title: string;
    details: string[];
    nextSteps: string[];
}

const VERIFY_FAIL_MARKER = 'UMBRA_VERIFY_FAIL|';
let VERIFY_FAILURE: VerifyFailureState | null = null;
let VERIFY_FAILURE_PRINTED = false;

function log(icon: string, message: string) {
    console.log(`  ${icon} ${message}`);
}

function ensureDir(dirPath: string) {
    mkdirSync(dirPath, { recursive: true });
}

function setVerifyFailure(
    code: string,
    title: string,
    details: string[] = [],
    nextSteps: string[] = [],
    overwrite = true
) {
    if (!overwrite && VERIFY_FAILURE) return;
    VERIFY_FAILURE = { code, title, details, nextSteps };
}

function failWithVerify(
    code: string,
    title: string,
    details: string[] = [],
    nextSteps: string[] = [],
    overwrite = true
): false {
    setVerifyFailure(code, title, details, nextSteps, overwrite);
    return false;
}

function printVerifyFailureSummary() {
    if (VERIFY_FAILURE_PRINTED) return;
    VERIFY_FAILURE_PRINTED = true;
    const failure = VERIFY_FAILURE || {
        code: 'unknown',
        title: 'Tool setup failed verification.',
        details: [],
        nextSteps: []
    };

    console.log(`\n${c.red}${c.bold}Verification failed${c.reset}`);
    log(`${c.red}✗${c.reset}`, `${failure.title} (${failure.code})`);
    for (const detail of failure.details) {
        log('-', detail);
    }
    if (failure.nextSteps.length > 0) {
        log('→', 'Suggested next steps:');
        for (const step of failure.nextSteps) {
            log('  -', step);
        }
    }
    console.log(`${VERIFY_FAIL_MARKER}${JSON.stringify(failure)}`);
    console.log('');
}

function exitWithVerifyFailure(
    code: string,
    title: string,
    details: string[] = [],
    nextSteps: string[] = [],
    overwrite = true
): never {
    setVerifyFailure(code, title, details, nextSteps, overwrite);
    printVerifyFailureSummary();
    process.exit(1);
}

function exitWithExistingVerifyFailure(): never {
    printVerifyFailureSummary();
    process.exit(1);
}

function hasCommand(cmd: string): boolean {
    try {
        const checker = IS_WINDOWS ? 'where' : 'which';
        const res = spawnSync(checker, [cmd], { encoding: 'utf-8', shell: true });
        return res.status === 0;
    } catch {
        return false;
    }
}

function runPlatformPreflight(): boolean {
    const platform = process.platform;
    const arch = process.arch;

    // Explicitly support Windows + Linux for tool bootstrap/update flow.
    if (!IS_WINDOWS && !IS_LINUX) {
        log(`${c.red}✗${c.reset}`, `Unsupported platform: ${platform} (${arch})`);
        log('→', 'Tool installer currently supports Windows and Linux only.');
        return failWithVerify(
            'unsupported-platform',
            'Unsupported operating system for Umbra tool installer.',
            [`Detected platform: ${platform} (${arch})`],
            ['Run Umbra Studio on Linux or Windows.']
        );
    }

    log(`${c.green}✓${c.reset}`, `Platform detected: ${platform} (${arch})`);

    // Required for repository bootstrap/update in all supported environments.
    if (!hasCommand('git')) {
        log(`${c.red}✗${c.reset}`, 'Missing required command: git');
        return failWithVerify(
            'missing-git',
            'Required command is missing: git.',
            ['The installer cannot clone or update tool repositories.'],
            ['Install git and rerun the install action.']
        );
    }

    // Required for portable Python bootstrap (Linux + Windows path).
    if (!hasCommand('curl')) {
        log(`${c.red}✗${c.reset}`, 'Missing required command: curl');
        return failWithVerify(
            'missing-curl',
            'Required command is missing: curl.',
            ['Portable Python 3.11 bootstrap requires curl.'],
            ['Install curl and rerun the install action.']
        );
    }

    // Required to extract portable Python archives.
    if (!hasCommand('tar')) {
        log(`${c.red}✗${c.reset}`, 'Missing required command: tar');
        return failWithVerify(
            'missing-tar',
            'Required command is missing: tar.',
            ['Portable Python 3.11 archive extraction requires tar.'],
            ['Install tar and rerun the install action.']
        );
    }

    return true;
}

// ============================================
// HELPERS
// ============================================

let PYTHON_CMD = '';
let PYTHON_VERSION = '';
let PYTHON_DETECTED_VERSIONS = '';
let GPU_NAME = '';

function detectGPU(): void {
    try {
        const result = spawnSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
            encoding: 'utf-8'
        });
        if (result.status === 0 && result.stdout.trim()) {
            GPU_NAME = result.stdout.trim().split('\n')[0];
        }
    } catch { }
}

function isBlackwellGPU(): boolean {
    // RTX 50xx series (Blackwell architecture) targets CUDA 13.x (sm_120).
    const blackwellPatterns = [
        /RTX\s*50[0-9]{2}/i,
        /Blackwell/i,
        /GB[0-9]{3}/i
    ];
    return blackwellPatterns.some(pattern => pattern.test(GPU_NAME));
}

function getPyTorchIndexCandidates(): string[] {
    // Prefer newest CUDA wheel index first, then fall back.
    if (isBlackwellGPU()) {
        return [
            'https://download.pytorch.org/whl/cu131',
            'https://download.pytorch.org/whl/cu130',
            'https://download.pytorch.org/whl/cu128',
            'https://download.pytorch.org/whl/cu126',
            'https://download.pytorch.org/whl/cu124',
            'https://download.pytorch.org/whl/cpu'
        ];
    }
    return [
        'https://download.pytorch.org/whl/cu131',
        'https://download.pytorch.org/whl/cu130',
        'https://download.pytorch.org/whl/cu128',
        'https://download.pytorch.org/whl/cu126',
        'https://download.pytorch.org/whl/cu124',
        'https://download.pytorch.org/whl/cpu'
    ];
}

function upgradePyTorchPackages(runPipCommand: (pipCommand: string) => boolean): boolean {
    const packages = 'torch torchvision torchaudio';
    for (const indexUrl of getPyTorchIndexCandidates()) {
        log('->', `Trying PyTorch wheel index: ${indexUrl}`);
        const installCommand = `pip install --upgrade ${packages} --index-url ${indexUrl}`;
        if (runPipCommand(installCommand)) {
            return true;
        }
    }
    return false;
}

function restoreAIToolkitCudaPyTorch(
    runInVenv: (command: string) => boolean,
    venvPython: string,
    torchMarker: string
): boolean {
    if (!GPU_NAME || checkPyTorchCuda(venvPython)) {
        const torchInfo = getInstalledTorchInfo(venvPython);
        if (torchInfo) {
            try {
                writeFileSync(torchMarker, `${torchInfo.version}|${torchInfo.cuda}`, 'utf-8');
            } catch { }
        }
        return true;
    }

    let torchVersion = '';
    let torchvisionVersion = '';
    try {
        const result = spawnSync(venvPython, [
            '-c',
            "import importlib.metadata as m; print(m.version('torch').split('+')[0]); print(m.version('torchvision').split('+')[0])"
        ], {
            encoding: 'utf-8',
            shell: false,
            timeout: 30000
        });
        if (result.status === 0) {
            const versions = String(result.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
            torchVersion = versions[0] || '';
            torchvisionVersion = versions[1] || '';
        }
    } catch { }

    if (!torchVersion || !torchvisionVersion) {
        return false;
    }

    try {
        rmSync(torchMarker, { force: true });
    } catch { }

    for (const indexUrl of getPyTorchIndexCandidates().filter((url) => !url.endsWith('/cpu'))) {
        const cudaTag = indexUrl.split('/').pop() || '';
        log('->', `Restoring AI-Toolkit CUDA wheels from ${cudaTag} without changing its pinned Torch versions...`);
        const installCommand = [
            'python -m pip install --upgrade --force-reinstall --no-deps',
            `"torch==${torchVersion}+${cudaTag}"`,
            `"torchvision==${torchvisionVersion}+${cudaTag}"`,
            `--index-url ${indexUrl}`
        ].join(' ');
        if (!runInVenv(installCommand) || !checkPyTorchCuda(venvPython)) continue;

        const torchInfo = getInstalledTorchInfo(venvPython);
        if (torchInfo) {
            try {
                writeFileSync(torchMarker, `${torchInfo.version}|${torchInfo.cuda}`, 'utf-8');
            } catch { }
            log(`${c.green}OK${c.reset}`, `AI-Toolkit CUDA runtime ready: torch ${torchInfo.version} (CUDA ${torchInfo.cuda})`);
        }
        return true;
    }

    return false;
}

function parsePythonVersion(output: string): { major: number; minor: number; patch: number } | null {
    const match = output.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3] || 0)
    };
}

function isPython311Version(version: { major: number; minor: number }): boolean {
    return version.major === 3 && version.minor === 11;
}

function isPython313Version(version: { major: number; minor: number }): boolean {
    return version.major === 3 && version.minor === 13;
}

function findPortablePython311Binary(searchRoot: string): string | null {
    if (!existsSync(searchRoot)) return null;

    const stack: string[] = [searchRoot];
    const matches: string[] = [];
    while (stack.length > 0) {
        const current = stack.pop()!;
        let entries: any;
        try {
            entries = readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (IS_WINDOWS) {
                if (entry.isFile() && entry.name.toLowerCase() === 'python.exe') {
                    matches.push(fullPath);
                }
            } else {
                if (entry.isFile() && entry.name === 'python3.11' && current.endsWith('/bin')) {
                    matches.push(fullPath);
                }
            }
        }
    }

    if (matches.length === 0) return null;

    const scored = matches
        .map((p) => {
            const normalized = p.replace(/\\/g, '/');
            let score = 0;
            if (normalized.includes('/python/install/')) score += 50;
            if (normalized.includes('/install/')) score += 20;
            if (normalized.includes('/bin/')) score += 10;
            score -= normalized.length / 1000;
            return { p, score };
        })
        .sort((a, b) => b.score - a.score);

    return scored[0]?.p || null;
}

function getPortableInstallRootFromBinary(pythonBinaryPath: string): string {
    const parent = dirname(pythonBinaryPath);
    const parentName = basename(parent).toLowerCase();
    // Linux standalone: .../install/bin/python3.11
    if (parentName === 'bin') return dirname(parent);
    // Windows standalone: .../install/python.exe
    return parent;
}

function installPortablePython311Linux(): boolean {
    if (!IS_LINUX) return false;
    try {
        ensureDir(RUNTIME_DIR);
        const bootstrapDir = join(RUNTIME_DIR, '.python-bootstrap');
        rmSync(bootstrapDir, { recursive: true, force: true });
        ensureDir(bootstrapDir);

        const releaseRaw = execSync(
            'curl -fsSL https://api.github.com/repos/indygreg/python-build-standalone/releases/latest',
            { encoding: 'utf-8', shell: '/bin/bash', maxBuffer: 16 * 1024 * 1024 }
        );
        const release = JSON.parse(releaseRaw) as { assets?: Array<{ name?: string; browser_download_url?: string }> };
        const assets = release.assets || [];

        const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
        const rank = [
            `${arch}-unknown-linux-gnu-install_only.tar.gz`,
            `${arch}-unknown-linux-musl-install_only.tar.gz`
        ];

        const candidates = assets.filter((asset) =>
            Boolean(
                asset?.name &&
                asset?.browser_download_url &&
                asset.name.includes('cpython-3.11') &&
                asset.name.endsWith('.tar.gz') &&
                asset.name.includes('install_only') &&
                rank.some((suffix) => asset.name!.includes(suffix))
            )
        );

        if (candidates.length === 0) {
            log(`${c.red}✗${c.reset}`, 'Unable to find a portable Python 3.11 Linux build asset.');
            return failWithVerify(
                'python311-asset-missing-linux',
                'Portable Python 3.11 asset lookup failed.',
                ['No compatible Linux python-build-standalone asset was found.'],
                ['Check internet access and retry install.']
            );
        }

        const selected = candidates.sort((a, b) => {
            const aIdx = rank.findIndex((suffix) => a.name!.includes(suffix));
            const bIdx = rank.findIndex((suffix) => b.name!.includes(suffix));
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        })[0];

        const archivePath = join(bootstrapDir, selected.name!);
        log('→', `Downloading portable Python 3.11 (${selected.name})...`);
        execSync(`curl -fL "${selected.browser_download_url}" -o "${archivePath}"`, {
            stdio: 'inherit',
            shell: '/bin/bash'
        });

        const extractDir = join(bootstrapDir, 'extract');
        ensureDir(extractDir);
        execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, {
            stdio: 'inherit',
            shell: '/bin/bash'
        });

        const extractedPython = findPortablePython311Binary(extractDir);
        if (!extractedPython) {
            log(`${c.red}✗${c.reset}`, 'Portable Python archive did not contain python3.11.');
            return failWithVerify(
                'python311-archive-invalid-linux',
                'Portable Python 3.11 archive verification failed.',
                ['Downloaded archive did not include python3.11 binary.'],
                ['Retry install; if issue persists, check upstream release asset.']
            );
        }

        const installRoot = getPortableInstallRootFromBinary(extractedPython);
        rmSync(PORTABLE_PY311_HOME, { recursive: true, force: true });
        cpSync(installRoot, PORTABLE_PY311_HOME, { recursive: true, force: true });

        const finalPython = findPortablePython311Binary(PORTABLE_PY311_HOME);
        if (!finalPython) {
            log(`${c.red}✗${c.reset}`, 'Portable Python install failed (python3.11 missing after extract).');
            return failWithVerify(
                'python311-install-invalid-linux',
                'Portable Python 3.11 install verification failed.',
                ['python3.11 binary missing after extraction/copy step.'],
                ['Delete Runtime/Python311 and retry install.']
            );
        }

        try {
            execSync(`chmod +x "${finalPython}"`, { shell: '/bin/bash' });
        } catch { }

        log(`${c.green}✓${c.reset}`, `Portable Python installed: ${PORTABLE_PY311_HOME}`);
        rmSync(bootstrapDir, { recursive: true, force: true });
        return true;
    } catch {
        log(`${c.red}✗${c.reset}`, 'Failed to download/install portable Python 3.11 runtime.');
        return failWithVerify(
            'python311-bootstrap-failed-linux',
            'Portable Python 3.11 bootstrap failed.',
            ['Download or extraction step failed for Linux runtime bootstrap.'],
            ['Check network access and disk permissions, then retry.']
        );
    }
}

function installPortablePython311Windows(): boolean {
    if (!IS_WINDOWS) return false;
    try {
        ensureDir(RUNTIME_DIR);
        const bootstrapDir = join(RUNTIME_DIR, '.python-bootstrap');
        rmSync(bootstrapDir, { recursive: true, force: true });
        ensureDir(bootstrapDir);

        const releaseRaw = execSync(
            'curl -fsSL https://api.github.com/repos/indygreg/python-build-standalone/releases/latest',
            { encoding: 'utf-8', shell: 'cmd.exe', maxBuffer: 16 * 1024 * 1024 }
        );
        const release = JSON.parse(releaseRaw) as { assets?: Array<{ name?: string; browser_download_url?: string }> };
        const assets = release.assets || [];

        const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
        const rank = [
            `${arch}-pc-windows-msvc-install_only.tar.gz`,
            `${arch}-pc-windows-msvc-install_only_stripped.tar.gz`
        ];

        const candidates = assets.filter((asset) =>
            Boolean(
                asset?.name &&
                asset?.browser_download_url &&
                asset.name.includes('cpython-3.11') &&
                asset.name.endsWith('.tar.gz') &&
                asset.name.includes('install_only') &&
                rank.some((suffix) => asset.name!.includes(suffix))
            )
        );

        if (candidates.length === 0) {
            log(`${c.red}✗${c.reset}`, 'Unable to find a portable Python 3.11 Windows build asset.');
            return failWithVerify(
                'python311-asset-missing-windows',
                'Portable Python 3.11 asset lookup failed.',
                ['No compatible Windows python-build-standalone asset was found.'],
                ['Check internet access and retry install.']
            );
        }

        const selected = candidates.sort((a, b) => {
            const aIdx = rank.findIndex((suffix) => a.name!.includes(suffix));
            const bIdx = rank.findIndex((suffix) => b.name!.includes(suffix));
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        })[0];

        const archivePath = join(bootstrapDir, selected.name!);
        log('→', `Downloading portable Python 3.11 (${selected.name})...`);
        execSync(`curl -fL "${selected.browser_download_url}" -o "${archivePath}"`, {
            stdio: 'inherit',
            shell: 'cmd.exe'
        });

        const extractDir = join(bootstrapDir, 'extract');
        ensureDir(extractDir);
        execSync(`tar -xzf "${archivePath}" -C "${extractDir}"`, {
            stdio: 'inherit',
            shell: 'cmd.exe'
        });

        const extractedPython = findPortablePython311Binary(extractDir);
        if (!extractedPython) {
            log(`${c.red}✗${c.reset}`, 'Portable Python archive did not contain python.exe.');
            return failWithVerify(
                'python311-archive-invalid-windows',
                'Portable Python 3.11 archive verification failed.',
                ['Downloaded archive did not include python.exe binary.'],
                ['Retry install; if issue persists, check upstream release asset.']
            );
        }

        const installRoot = getPortableInstallRootFromBinary(extractedPython);
        rmSync(PORTABLE_PY311_HOME, { recursive: true, force: true });
        cpSync(installRoot, PORTABLE_PY311_HOME, { recursive: true, force: true });

        const finalPython = findPortablePython311Binary(PORTABLE_PY311_HOME);
        if (!finalPython) {
            log(`${c.red}✗${c.reset}`, 'Portable Python install failed (python.exe missing after extract).');
            return failWithVerify(
                'python311-install-invalid-windows',
                'Portable Python 3.11 install verification failed.',
                ['python.exe missing after extraction/copy step.'],
                ['Delete Runtime/Python311 and retry install.']
            );
        }

        log(`${c.green}✓${c.reset}`, `Portable Python installed: ${PORTABLE_PY311_HOME}`);
        rmSync(bootstrapDir, { recursive: true, force: true });
        return true;
    } catch {
        log(`${c.red}✗${c.reset}`, 'Failed to download/install portable Python 3.11 runtime.');
        return failWithVerify(
            'python311-bootstrap-failed-windows',
            'Portable Python 3.11 bootstrap failed.',
            ['Download or extraction step failed for Windows runtime bootstrap.'],
            ['Check network access and disk permissions, then retry.']
        );
    }
}

function findPython311Runtime(): boolean {
    // Prefer Umbra's private Python runtime for true portability.
    const portablePython = findPortablePython311Binary(PORTABLE_PY311_HOME);
    if (portablePython) {
        try {
            const result = spawnSync(portablePython, ['--version'], { encoding: 'utf-8' });
            if (result.status === 0) {
                const versionOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
                const parsed = parsePythonVersion(versionOutput);
                if (parsed && isPython311Version(parsed)) {
                    PYTHON_CMD = `"${portablePython}"`;
                    PYTHON_VERSION = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
                    return true;
                }
            }
        } catch { }
    }

    const candidates = IS_WINDOWS
        ? ['py -3.11', 'python3.11', 'py -3', 'python3', 'python']
        : ['python3.11', 'python3', 'python'];
    const detectedVersions = new Set<string>();

    for (const cmd of candidates) {
        try {
            const result = spawnSync(cmd, ['--version'], { encoding: 'utf-8', shell: true });
            if (result.status !== 0) continue;

            const versionOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
            const parsed = parsePythonVersion(versionOutput);
            if (!parsed) continue;
            const versionLabel = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
            detectedVersions.add(`${cmd} -> ${versionLabel}`);
            if (!isPython311Version(parsed)) continue;

            PYTHON_CMD = cmd;
            PYTHON_VERSION = versionLabel;
            return true;
        } catch { }
    }

    if (detectedVersions.size > 0) {
        PYTHON_DETECTED_VERSIONS = Array.from(detectedVersions).join(', ');
    }

    // OS fallback: bootstrap private Python 3.11 runtime without touching system packages.
    if (IS_LINUX || IS_WINDOWS) {
        log('→', 'System Python 3.11 not found. Bootstrapping portable Python 3.11 runtime...');
        const installedOk = IS_LINUX ? installPortablePython311Linux() : installPortablePython311Windows();
        if (installedOk) {
            const installedPython = findPortablePython311Binary(PORTABLE_PY311_HOME);
            if (installedPython) {
                try {
                    const result = spawnSync(installedPython, ['--version'], { encoding: 'utf-8' });
                    if (result.status === 0) {
                        const versionOutput = `${result.stdout || ''}${result.stderr || ''}`.trim();
                        const parsed = parsePythonVersion(versionOutput);
                        if (parsed && isPython311Version(parsed)) {
                            PYTHON_CMD = `"${installedPython}"`;
                            PYTHON_VERSION = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
                            return true;
                        }
                    }
                } catch { }
            }
        }
    }

    return failWithVerify(
        'python311-runtime-unavailable',
        'Python 3.11 runtime was not detected or provisioned.',
        PYTHON_DETECTED_VERSIONS ? [`Detected Python versions: ${PYTHON_DETECTED_VERSIONS}`] : ['No usable Python runtime detected.'],
        [
            'Keep internet connected so Umbra can bootstrap Runtime/Python311.',
            'Or provide a valid Python 3.11 runtime under Runtime/Python311.'
        ],
        false
    );
}

function findToolPath(searchPatterns: string[]): string | null {
    if (!existsSync(TOOLS_DIR)) return null;
    try {
        const entries = readdirSync(TOOLS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .filter((name) => !name.startsWith('.'));
        for (const pattern of searchPatterns) {
            const normalized = pattern.toLowerCase();
            const exactMatch = entries.find((entry) => entry.toLowerCase() === normalized);
            if (exactMatch) return join(TOOLS_DIR, exactMatch);

            const startsWithMatch = entries.find((entry) => entry.toLowerCase().startsWith(normalized));
            if (startsWithMatch) return join(TOOLS_DIR, startsWithMatch);

            const containsMatch = entries.find((entry) => entry.toLowerCase().includes(normalized));
            if (containsMatch) return join(TOOLS_DIR, containsMatch);
        }
    } catch { }
    return null;
}

function isDirectoryEmpty(dir: string): boolean {
    try {
        return readdirSync(dir).length === 0;
    } catch {
        return true;
    }
}

function hasValidGitCheckout(dir: string): boolean {
    if (!existsSync(join(dir, '.git'))) return false;
    try {
        execSync('git rev-parse --verify HEAD', { cwd: dir, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function removeComfyModelPlaceholderCheckoutCollisions(dir: string): void {
    const modelsDir = join(dir, 'models');
    if (!existsSync(modelsDir)) return;

    let removed = 0;
    const isTrackedByGit = (filePath: string): boolean => {
        if (!existsSync(join(dir, '.git'))) return false;
        const relativePath = relative(dir, filePath).replace(/\\/g, '/');
        const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
            cwd: dir,
            stdio: 'ignore',
            shell: false
        });
        return result.status === 0;
    };

    const visit = (currentDir: string) => {
        let entries: string[] = [];
        try {
            entries = readdirSync(currentDir);
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(currentDir, entry);
            let stat;
            try {
                stat = lstatSync(fullPath);
            } catch {
                continue;
            }

            if (stat.isDirectory()) {
                visit(fullPath);
                continue;
            }

            if (!stat.isFile()) continue;
            if (!/^put_.*_here$/i.test(entry)) continue;
            if (stat.size !== 0) continue;
            if (isTrackedByGit(fullPath)) continue;

            try {
                unlinkSync(fullPath);
                removed += 1;
            } catch {
                // Leave real install/update failure handling to the git command.
            }
        }
    };

    visit(modelsDir);
    if (removed > 0) {
        log('→', `Removed ${removed} zero-byte ComfyUI model placeholder file(s) before git checkout.`);
    }
}

function getVenvPython(toolPath: string): string | null {
    const candidates = IS_WINDOWS
        ? ['venv\\Scripts\\python.exe', 'env\\Scripts\\python.exe', '.venv\\Scripts\\python.exe']
        : ['venv/bin/python', 'env/bin/python', '.venv/bin/python'];

    for (const candidate of candidates) {
        const fullPath = join(toolPath, candidate);
        if (existsSync(fullPath)) return fullPath;
    }
    return null;
}

function setupUmbraPythonHelpersVenv(): boolean {
    ensureDir(PYTHON_HELPERS_DIR);
    if (!getVenvPython(PYTHON_HELPERS_DIR)) {
        log('→', 'Creating Umbra Python helper venv...');
        if (!runCmd(`${PYTHON_CMD} -m venv venv`, PYTHON_HELPERS_DIR)) {
            return failWithVerify(
                'python-helper-venv-create-failed',
                'Failed to create Umbra Python helper virtual environment.',
                [`Helper path: ${PYTHON_HELPERS_DIR}`, `Python command: ${PYTHON_CMD}`],
                ['Ensure Runtime/Python311 is healthy, then retry install.']
            );
        }
    }

    const py = getVenvPython(PYTHON_HELPERS_DIR);
    if (!py) {
        return failWithVerify(
            'python-helper-venv-missing-python',
            'Umbra Python helper venv was created but no Python binary was found.',
            [`Helper path: ${PYTHON_HELPERS_DIR}`],
            ['Delete Runtime/PythonHelpers and retry install.']
        );
    }

    const markerPath = join(PYTHON_HELPERS_DIR, '.helper_requirements_installed');
    const requirementsKey = PYTHON_HELPER_PACKAGES.join('\n');
    if (existsSync(markerPath)) {
        try {
            if (readFileSync(markerPath, 'utf-8') === requirementsKey) {
                log('✓', 'Umbra Python helper venv already prepared. Skipping.');
                return true;
            }
        } catch {
            // reinstall below
        }
    }

    log('→', 'Installing Umbra Python helper packages...');
    const packages = PYTHON_HELPER_PACKAGES.map((pkg) => `"${pkg}"`).join(' ');
    if (!runCmd(`"${py}" -m pip install --upgrade pip ${packages}`, PYTHON_HELPERS_DIR)) {
        return failWithVerify(
            'python-helper-packages-install-failed',
            'Failed to install Umbra Python helper packages.',
            [`Helper path: ${PYTHON_HELPERS_DIR}`, `Packages: ${PYTHON_HELPER_PACKAGES.join(', ')}`],
            ['Retry with internet access, or remove Runtime/PythonHelpers and try again.']
        );
    }

    writeFileSync(markerPath, requirementsKey, 'utf-8');
    log(`${c.green}✓${c.reset}`, `Umbra Python helper venv ready: ${PYTHON_HELPERS_DIR}`);
    return true;
}

function checkPyTorchCuda(venvPython: string): boolean {
    try {
        const result = spawnSync(venvPython, ['-c', "import torch; print(torch.cuda.is_available())"], {
            encoding: 'utf-8',
            shell: false,
            timeout: 30000
        });
        if (result.status !== 0) return false;
        return String(result.stdout || '').includes('True');
    } catch { return false; }
}

function runCmd(cmd: string, cwd: string, ignoreError = false): boolean {
    try {
        execSync(cmd, { cwd, stdio: 'inherit', shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash' });
        return true;
    } catch {
        return ignoreError;
    }
}

function runCmdAllowFailure(cmd: string, cwd: string): boolean {
    try {
        execSync(cmd, { cwd, stdio: 'inherit', shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash' });
        return true;
    } catch {
        return false;
    }
}

let VS_DEV_CMD_PATH_CACHE: string | null | undefined;
let CUDA_TOOLKIT_PATH_CACHE: string | null | undefined;

function findVsDevCmdPath(): string | null {
    if (VS_DEV_CMD_PATH_CACHE !== undefined) return VS_DEV_CMD_PATH_CACHE;
    if (!IS_WINDOWS) {
        VS_DEV_CMD_PATH_CACHE = null;
        return VS_DEV_CMD_PATH_CACHE;
    }

    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const candidates = [
        join(pf86, 'Microsoft Visual Studio', '2022', 'BuildTools', 'Common7', 'Tools', 'VsDevCmd.bat'),
        join(pf86, 'Microsoft Visual Studio', '2022', 'Community', 'Common7', 'Tools', 'VsDevCmd.bat'),
        join(pf86, 'Microsoft Visual Studio', '2022', 'Professional', 'Common7', 'Tools', 'VsDevCmd.bat'),
        join(pf86, 'Microsoft Visual Studio', '2022', 'Enterprise', 'Common7', 'Tools', 'VsDevCmd.bat'),
        join(pf86, 'Microsoft Visual Studio', '2019', 'BuildTools', 'Common7', 'Tools', 'VsDevCmd.bat'),
        join(pf, 'Microsoft Visual Studio', '2022', 'BuildTools', 'Common7', 'Tools', 'VsDevCmd.bat'),
    ];

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            VS_DEV_CMD_PATH_CACHE = candidate;
            return VS_DEV_CMD_PATH_CACHE;
        }
    }

    VS_DEV_CMD_PATH_CACHE = null;
    return VS_DEV_CMD_PATH_CACHE;
}

function parseCudaDirVersion(name: string): { major: number; minor: number } | null {
    const match = /^v(\d+)\.(\d+)$/i.exec(name.trim());
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2])
    };
}

function findPreferredCudaToolkitPath(): string | null {
    if (CUDA_TOOLKIT_PATH_CACHE !== undefined) return CUDA_TOOLKIT_PATH_CACHE;
    if (!IS_WINDOWS) {
        CUDA_TOOLKIT_PATH_CACHE = null;
        return CUDA_TOOLKIT_PATH_CACHE;
    }

    const base = join('C:\\', 'Program Files', 'NVIDIA GPU Computing Toolkit', 'CUDA');
    if (!existsSync(base)) {
        CUDA_TOOLKIT_PATH_CACHE = null;
        return CUDA_TOOLKIT_PATH_CACHE;
    }

    let entries: string[] = [];
    try {
        entries = readdirSync(base, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    } catch {
        CUDA_TOOLKIT_PATH_CACHE = null;
        return CUDA_TOOLKIT_PATH_CACHE;
    }

    const candidates = entries
        .map((name) => {
            const parsed = parseCudaDirVersion(name);
            if (!parsed) return null;
            return {
                path: join(base, name),
                major: parsed.major,
                minor: parsed.minor
            };
        })
        .filter((item): item is { path: string; major: number; minor: number } => item !== null)
        .sort((a, b) => (b.major - a.major) || (b.minor - a.minor));

    CUDA_TOOLKIT_PATH_CACHE = candidates[0]?.path || null;
    return CUDA_TOOLKIT_PATH_CACHE;
}

function wrapWithVsDevCmd(cmd: string): string {
    if (!IS_WINDOWS) return cmd;
    const vsDevCmd = findVsDevCmdPath();
    const cudaToolkit = findPreferredCudaToolkitPath();
    const cudaEnvPrefix = cudaToolkit
        ? `set "CUDA_PATH=${cudaToolkit}" && set "CUDA_HOME=${cudaToolkit}" && set "CUDACXX=${join(cudaToolkit, 'bin', 'nvcc.exe')}" && set "NVCC_PREPEND_FLAGS=-I${join(cudaToolkit, 'include', 'cccl')}" && `
        : '';
    if (!vsDevCmd) {
        return `${cudaEnvPrefix}${cmd}`;
    }
    return `call "${vsDevCmd}" -no_logo -arch=x64 -host_arch=x64 >nul && ${cudaEnvPrefix}set DISTUTILS_USE_SDK=1 && set MSSdk=1 && set "CL=/Zc:preprocessor /std:c++17" && set "_CL_=/Zc:preprocessor /std:c++17" && ${cmd}`;
}

function runCmdCapture(cmd: string, cwd: string, useVsDevCmd = false): {
    ok: boolean;
    code: number | null;
    stdout: string;
    stderr: string;
} {
    const resolvedCommand = useVsDevCmd ? wrapWithVsDevCmd(cmd) : cmd;
    const result = spawnSync(resolvedCommand, {
        cwd,
        shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash',
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 8 * 1024 * 1024
    });
    return {
        ok: result.status === 0,
        code: result.status,
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || '')
    };
}

function escapeShellDoubleQuotes(value: string): string {
    return String(value || '').replace(/"/g, '\\"');
}

function markGitSafeDirectory(dir: string): void {
    const safeDir = escapeShellDoubleQuotes(dir);
    runCmdAllowFailure(`git config --global --add safe.directory "${safeDir}"`, dir);
}

function configureGitRepoForPortableUpdates(dir: string): void {
    if (!existsSync(join(dir, '.git'))) return;
    markGitSafeDirectory(dir);
    runCmdAllowFailure('git config --local core.fsmonitor false', dir);
    runCmdAllowFailure('git config --local core.untrackedCache false', dir);
}

function pullRepoWithRecovery(dir: string, branch?: string): boolean {
    configureGitRepoForPortableUpdates(dir);
    removeComfyModelPlaceholderCheckoutCollisions(dir);
    const pullCmd = branch
        ? `git pull --rebase --autostash origin "${branch}"`
        : 'git pull --rebase --autostash';
    if (runCmd(pullCmd, dir, true)) return true;
    runCmdAllowFailure('git fetch --all --prune', dir);
    removeComfyModelPlaceholderCheckoutCollisions(dir);
    if (branch) {
        const hasOriginBranch = runCmdCapture(`git rev-parse --verify "origin/${branch}"`, dir);
        if (hasOriginBranch.ok) {
            return runCmd(`git reset --hard "origin/${branch}"`, dir, true);
        }
        return false;
    }
    const upstream = runCmdCapture('git rev-parse --abbrev-ref --symbolic-full-name @{u}', dir);
    if (upstream.ok) {
        const upstreamRef = String(upstream.stdout || '').trim();
        if (upstreamRef) return runCmd(`git reset --hard "${upstreamRef}"`, dir, true);
    }
    const remoteHead = runCmdCapture('git symbolic-ref --short refs/remotes/origin/HEAD', dir);
    if (remoteHead.ok) {
        const remoteHeadRef = String(remoteHead.stdout || '').trim();
        if (remoteHeadRef.startsWith('origin/')) {
            return runCmd(`git reset --hard "${remoteHeadRef}"`, dir, true);
        }
    }
    return false;
}

function parseCudaToolkitVersion(raw: string): string {
    const text = String(raw || '');
    const match = text.match(/release\s+(\d+\.\d+)/i);
    return match?.[1] || 'unknown';
}

function getSageInstallDiagnostics(py: string, toolDir: string): {
    torchCuda: string;
    cudaToolkit: string;
    clAvailable: boolean;
    clAvailableViaVsDevCmd: boolean;
    vsDevCmdPath: string;
} {
    const torchResult = runCmdCapture(`"${py}" -c "import torch; print(torch.version.cuda or 'cpu')"`, toolDir);
    const torchCuda = String(torchResult.stdout || '').trim() || 'unknown';

    const nvccResult = IS_WINDOWS
        ? runCmdCapture('"%CUDA_HOME%\\bin\\nvcc" --version', toolDir, true)
        : runCmdCapture('nvcc --version', toolDir, false);
    const cudaToolkit = nvccResult.ok
        ? parseCudaToolkitVersion(`${nvccResult.stdout}\n${nvccResult.stderr}`)
        : 'not-found';

    const clCheck = IS_WINDOWS
        ? spawnSync('where', ['cl'], { encoding: 'utf-8', shell: true })
        : spawnSync('which', ['cc'], { encoding: 'utf-8', shell: true });
    const clAvailable = clCheck.status === 0;
    const clViaVs = IS_WINDOWS ? runCmdCapture('where cl', toolDir, true).ok : clAvailable;
    const vsDevCmdPath = findVsDevCmdPath() || 'not-found';

    return { torchCuda, cudaToolkit, clAvailable, clAvailableViaVsDevCmd: clViaVs, vsDevCmdPath };
}

function selectSageAttentionWindowsWheel(torchCuda: string): string | null {
    if (!IS_WINDOWS) return null;
    const cudaTag = torchCuda.startsWith('13.') ? 'cu130' : torchCuda.startsWith('12.8') ? 'cu128' : '';
    if (!cudaTag) return null;
    try {
        const raw = execSync('curl -fsSL https://api.github.com/repos/woct0rdho/SageAttention/releases/latest', {
            encoding: 'utf-8',
            shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash',
            maxBuffer: 8 * 1024 * 1024
        });
        const release = JSON.parse(raw) as { tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string }> };
        const assets = release.assets || [];
        const preferred = assets.find((asset) =>
            Boolean(
                asset?.name &&
                asset?.browser_download_url &&
                asset.name.includes(cudaTag) &&
                asset.name.includes('win_amd64.whl')
            )
        );
        return preferred?.browser_download_url || null;
    } catch {
        return null;
    }
}

function normalizeGitUrl(url: string): string {
    return String(url || '').trim().replace(/\.git$/i, '').toLowerCase();
}

function ensureRepoSourceAndBranch(dir: string, repoUrl: string, branch?: string): boolean {
    if (!hasValidGitCheckout(dir)) return true;
    try {
        configureGitRepoForPortableUpdates(dir);
        let originUrl = '';
        try {
            originUrl = String(execSync('git remote get-url origin', { cwd: dir, encoding: 'utf-8' })).trim();
        } catch {
            originUrl = '';
        }

        if (!originUrl) {
            execSync(`git remote add origin "${repoUrl}"`, { cwd: dir, stdio: 'inherit' });
        } else if (normalizeGitUrl(originUrl) !== normalizeGitUrl(repoUrl)) {
            log('→', `Switching repository origin to ${repoUrl}`);
            execSync(`git remote set-url origin "${repoUrl}"`, { cwd: dir, stdio: 'inherit' });
        }

        if (branch) {
            execSync(`git fetch --prune origin "${branch}"`, { cwd: dir, stdio: 'inherit' });
            removeComfyModelPlaceholderCheckoutCollisions(dir);
            execSync(`git checkout -B "${branch}" "origin/${branch}"`, { cwd: dir, stdio: 'inherit' });
        }
        return true;
    } catch {
        return failWithVerify(
            'repo-branch-sync-failed',
            'Failed to synchronize repository origin/branch.',
            [`Repository: ${repoUrl}`, `Branch: ${branch || '(default)'}`, `Target: ${dir}`],
            ['Verify repository access and rerun install/update.']
        );
    }
}

function getInstalledTorchInfo(venvPython: string): { version: string; cuda: string } | null {
    try {
        const result = spawnSync(venvPython, ['-c', "import torch; print(torch.__version__); print(torch.version.cuda or 'cpu')"], {
            encoding: 'utf-8',
            shell: false,
            timeout: 30000
        });
        if (result.status !== 0) return null;
        const lines = String(result.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return null;
        return { version: lines[0], cuda: lines[1] };
    } catch {
        return null;
    }
}

function isPython313OrNewerRuntime(): boolean {
    const parsed = parsePythonVersion(`Python ${PYTHON_VERSION}`);
    if (!parsed) return false;
    return parsed.major > 3 || (parsed.major === 3 && parsed.minor >= 13);
}

function canImportPythonModule(venvPython: string, moduleName: string): boolean {
    try {
        const result = spawnSync(venvPython, ['-c', `import ${moduleName}`], {
            encoding: 'utf-8',
            shell: false,
            timeout: 30000
        });
        return result.status === 0;
    } catch {
        return false;
    }
}

function hasUmbraNodesPayload(dirPath: string): boolean {
    try {
        return (
            existsSync(join(dirPath, 'nodes.py')) &&
            existsSync(join(dirPath, '__init__.py'))
        );
    } catch {
        return false;
    }
}

function resolveUmbraNodesSource(): string | null {
    const candidates = [
        join(ROOT_DIR, 'Umbra-Nodes'),
        join(ROOT_DIR, 'resources', 'app', 'Umbra-Nodes')
    ];

    for (const candidate of candidates) {
        if (hasUmbraNodesPayload(candidate)) return candidate;
    }

    return null;
}

function resolveComfyExampleWorkflowSource(): string | null {
    const candidates = [
        join(ROOT_DIR, 'Umbra-Nodes', 'Example_Workflows', 'ComfyUI'),
        join(ROOT_DIR, 'Umbra-Nodes', 'example_workflows'),
        join(ROOT_DIR, 'Umbra-Nodes', 'examples'),
        join(ROOT_DIR, 'resources', 'app', 'Umbra-Nodes', 'Example_Workflows', 'ComfyUI'),
        join(ROOT_DIR, 'resources', 'app', 'Umbra-Nodes', 'example_workflows'),
        join(ROOT_DIR, 'resources', 'app', 'Umbra-Nodes', 'examples'),
        join(TOOLS_DIR, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'Example_Workflows', 'ComfyUI'),
        join(TOOLS_DIR, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'example_workflows'),
        join(TOOLS_DIR, 'ComfyUI', 'custom_nodes', 'Umbra-Nodes', 'examples')
    ];
    for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        try {
            const hasJson = readdirSync(candidate).some((entry) => entry.toLowerCase().endsWith('.json'));
            if (hasJson) return candidate;
        } catch {
            // ignore read errors and continue checking fallbacks
        }
    }
    return null;
}

const UMBRA_NODES_REPO = 'https://github.com/Minokai69/umbra-nodes.git';

function isCanvasWorkflowDocumentFile(filePath: string): boolean {
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.nodes)) return true;
        if (parsed?.workflow && Array.isArray(parsed.workflow.nodes)) return true;
        return false;
    } catch {
        return false;
    }
}

function syncUmbraNodesToComfy(nodesDir: string) {
    const sourceUmbraNodes = resolveUmbraNodesSource();
    const targetUmbraNodes = join(nodesDir, 'Umbra-Nodes');

    if (!sourceUmbraNodes) {
        try {
            ensureDir(nodesDir);
            if (existsSync(targetUmbraNodes) && !hasUmbraNodesPayload(targetUmbraNodes)) {
                rmSync(targetUmbraNodes, { recursive: true, force: true });
            }
            if (hasUmbraNodesPayload(targetUmbraNodes)) {
                try {
                    configureGitRepoForPortableUpdates(targetUmbraNodes);
                    execSync('git pull --ff-only', { cwd: targetUmbraNodes, stdio: 'ignore' });
                    log(`${c.green}✓${c.reset}`, 'Umbra-Nodes updated from public repository');
                } catch {
                    log(`${c.green}✓${c.reset}`, 'Umbra-Nodes detected');
                }
                return;
            }
            log('→', 'Installing Umbra-Nodes from public repository...');
            execSync(`git clone ${UMBRA_NODES_REPO} Umbra-Nodes`, { cwd: nodesDir, stdio: 'ignore' });
            configureGitRepoForPortableUpdates(targetUmbraNodes);
            if (hasUmbraNodesPayload(targetUmbraNodes)) {
                log(`${c.green}✓${c.reset}`, 'Umbra-Nodes installed to ComfyUI custom_nodes');
            } else {
                log(`${c.yellow}⚠${c.reset}`, 'Umbra-Nodes cloned, but required .py files were not found.');
            }
        } catch {
            log(`${c.red}✗${c.reset}`, 'Failed to install Umbra-Nodes from public repository');
        }
        return;
    }

    try {
        ensureDir(nodesDir);
        cpSync(sourceUmbraNodes, targetUmbraNodes, { recursive: true, force: true });
        pruneDuplicateUmbraVhsCore(nodesDir, targetUmbraNodes);
        if (hasUmbraNodesPayload(targetUmbraNodes)) {
            log(`${c.green}✓${c.reset}`, 'Umbra-Nodes synced to ComfyUI custom_nodes');
        } else {
            log(`${c.yellow}⚠${c.reset}`, 'Umbra-Nodes synced, but required .py files were not found.');
        }
    } catch {
        log(`${c.red}✗${c.reset}`, 'Failed to sync Umbra-Nodes');
    }
}

function findVideoHelperSuiteDir(nodesDir: string): string | null {
    try {
        const entries = readdirSync(nodesDir, { withFileTypes: true });
        const match = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === 'comfyui-videohelpersuite');
        return match ? join(nodesDir, match.name) : null;
    } catch {
        return null;
    }
}

function pruneDuplicateUmbraVhsCore(nodesDir: string, umbraNodesDir: string): void {
    if (!findVideoHelperSuiteDir(nodesDir)) return;
    const duplicateShimPath = join(umbraNodesDir, 'web', 'js', 'Umbra.VHS.core.js');
    try {
        rmSync(duplicateShimPath, { force: true });
    } catch {
        // Ignore cleanup failure; syncing the main node payload matters more.
    }
}


function seedComfyExampleWorkflows(comfyDir: string) {
    const sourceDir = resolveComfyExampleWorkflowSource();
    if (!sourceDir) {
        log(`${c.yellow}⚠${c.reset}`, 'ComfyUI example workflow source not found.');
        return;
    }

    const targetDir = join(comfyDir, 'user', 'default', 'workflows');
    ensureDir(targetDir);

    let copied = 0;
    try {
        for (const entry of readdirSync(sourceDir)) {
            if (!entry.toLowerCase().endsWith('.json')) continue;
            const sourcePath = join(sourceDir, entry);
            if (!isCanvasWorkflowDocumentFile(sourcePath)) continue;
            const targetPath = join(targetDir, entry);
            if (existsSync(targetPath)) continue;
            cpSync(sourcePath, targetPath, { recursive: false, force: false });
            copied += 1;
        }
    } catch {
        log(`${c.red}✗${c.reset}`, 'Failed to seed ComfyUI example workflows.');
        return;
    }

    if (copied > 0) {
        log(`${c.green}✓${c.reset}`, `Seeded ${copied} ComfyUI example workflow(s)`);
    } else {
        log('→', 'ComfyUI example workflows already present');
    }
}

// Interactive Helper
function ensureAIToolkitDatasetsLink(toolDir: string) {
    const userDatasetsDir = join(ROOT_DIR, 'User', 'Datasets');
    const toolkitDatasetsDir = join(toolDir, 'datasets');
    ensureDir(userDatasetsDir);

    if (existsSync(toolkitDatasetsDir)) {
        try {
            const existing = lstatSync(toolkitDatasetsDir);
            if (existing.isSymbolicLink()) {
                unlinkSync(toolkitDatasetsDir);
            } else if (existing.isDirectory()) {
                const entries = readdirSync(toolkitDatasetsDir);
                if (entries.length > 0) {
                    log(`${c.yellow}!${c.reset}`, 'AI-Toolkit datasets folder is not empty; leaving it unchanged');
                    return;
                }
                rmSync(toolkitDatasetsDir, { recursive: true, force: true });
            } else {
                log(`${c.yellow}!${c.reset}`, 'AI-Toolkit datasets path is not a directory; leaving it unchanged');
                return;
            }
        } catch (error: any) {
            log(`${c.yellow}!${c.reset}`, `Could not prepare AI-Toolkit datasets link: ${error?.message || error}`);
            return;
        }
    }

    try {
        symlinkSync(userDatasetsDir, toolkitDatasetsDir, IS_WINDOWS ? 'junction' : 'dir');
        log(`${c.green}OK${c.reset}`, `AI-Toolkit datasets -> ${userDatasetsDir}`);
    } catch (error: any) {
        log(`${c.yellow}!${c.reset}`, `Could not link AI-Toolkit datasets: ${error?.message || error}`);
    }
}

async function checkUpdates(dir: string, repoUrl: string) {
    if (!existsSync(join(dir, '.git'))) return;

    try {
        configureGitRepoForPortableUpdates(dir);
        execSync('git fetch', { cwd: dir, stdio: 'ignore' });
        const status = execSync('git status -uno', { cwd: dir, encoding: 'utf-8' });

        if (status.includes('behind')) {
            console.log(`\n${c.yellow}⚠ Update available for ${basename(dir)}!${c.reset}`);
            console.log(`  Changelog: ${repoUrl}`);

            // Allow user to see this
            const answer = await prompt("  Do you want to update? [y/N]: ");
            const doUpdate = answer?.toLowerCase().startsWith('y') || false;

            if (doUpdate) {
                log('→', 'Updating...');
                if (!pullRepoWithRecovery(dir)) { throw new Error('git pull failed'); }
                log(`${c.green}✓${c.reset}`, 'Updated successfully');
            } else {
                log('→', 'Skipping update.');
            }
        }
    } catch {
        // Silent fail on update check issues
    }
}

// ============================================
// SETUP LOGIC
// ============================================

function prompt(question: string): Promise<string> {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, (answer: string) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function cloneRepo(url: string, targetDir: string, branch?: string) {
    log('→', `Cloning ${url}${branch ? `#${branch}` : ''}...`);
    try {
        if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
        const hasGitDir = existsSync(join(targetDir, '.git'));

        if (hasValidGitCheckout(targetDir)) {
            log('✓', 'Git repository already present. Skipping clone.');
            if (!ensureRepoSourceAndBranch(targetDir, url, branch)) return false;
        } else if (isDirectoryEmpty(targetDir) && !hasGitDir) {
            const branchArgs = branch ? ` --branch "${branch}" --single-branch` : '';
            execSync(`git clone${branchArgs} "${url}" .`, { cwd: targetDir, stdio: 'inherit' });
        } else {
            log('→', 'Existing folder detected; initializing repository in place...');
            if (!hasGitDir) execSync('git init', { cwd: targetDir, stdio: 'inherit' });
            try {
                execSync('git remote remove origin', { cwd: targetDir, stdio: 'ignore' });
            } catch { }
            execSync(`git remote add origin "${url}"`, { cwd: targetDir, stdio: 'inherit' });
            if (branch) {
                execSync(`git fetch --depth 1 origin "${branch}"`, { cwd: targetDir, stdio: 'inherit' });
                removeComfyModelPlaceholderCheckoutCollisions(targetDir);
                execSync(`git checkout -B "${branch}" "origin/${branch}"`, { cwd: targetDir, stdio: 'inherit' });
            } else {
                execSync('git fetch --depth 1 origin', { cwd: targetDir, stdio: 'inherit' });

                let headRef = '';
                try {
                    headRef = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', {
                        cwd: targetDir,
                        encoding: 'utf-8'
                    }).trim();
                } catch { }

                if (headRef.startsWith('origin/')) {
                    const defaultBranch = headRef.slice('origin/'.length);
                    removeComfyModelPlaceholderCheckoutCollisions(targetDir);
                    execSync(`git checkout -B "${defaultBranch}" "origin/${defaultBranch}"`, { cwd: targetDir, stdio: 'inherit' });
                } else {
                    removeComfyModelPlaceholderCheckoutCollisions(targetDir);
                    execSync('git checkout -f FETCH_HEAD', { cwd: targetDir, stdio: 'inherit' });
                }
            }
        }

        if (!ensureRepoSourceAndBranch(targetDir, url, branch)) return false;
        configureGitRepoForPortableUpdates(targetDir);

        log(`${c.green}✓${c.reset}`, 'Cloned successfully');
        return true;
    } catch {
        log(`${c.red}✗${c.reset}`, 'Git clone failed');
        return failWithVerify(
            'repo-clone-failed',
            'Repository clone/bootstrap failed.',
            [`Repository: ${url}`, `Branch: ${branch || '(default)'}`, `Target: ${targetDir}`],
            ['Check repository/network access and rerun install.']
        );
    }
}

function setupPythonEnv(dir: string, toolId: string) {
    // 1. Create Venv
    if (!getVenvPython(dir)) {
        log('→', 'Creating venv...');
        if (!runCmd(`${PYTHON_CMD} -m venv venv`, dir)) {
            log(`${c.red}✗${c.reset}`, 'Failed to create venv');
            return failWithVerify(
                'venv-create-failed',
                'Failed to create tool virtual environment.',
                [`Tool path: ${dir}`, `Python command: ${PYTHON_CMD}`],
                ['Ensure Runtime/Python311 is healthy, then retry install.']
            );
        }
    }

    // Helper to run in venv
    const runInVenv = (command: string) => {
        const activate = IS_WINDOWS ? `call venv\\Scripts\\activate.bat` : `source venv/bin/activate`;
        return runCmd(`${activate} && ${command}`, dir);
    };

    const py = getVenvPython(dir)!;
    // 2. Check if PyTorch exists
    // Use a marker file to avoid slow CUDA checks on every launch
    const torchMarker = join(dir, '.torch_installed');
    let hasTorch = existsSync(torchMarker);

    if (!hasTorch) {
        // Only do the expensive CUDA check if no marker exists
        hasTorch = checkPyTorchCuda(py);
    }

    if (!hasTorch) {
        log('→', 'PyTorch not found. Installing...');
        runInVenv('python -m pip install --upgrade pip');

        // Install newest available torch/vision/audio with CUDA-first fallback.
        if (!upgradePyTorchPackages(runInVenv)) {
            log(`${c.red}✗${c.reset}`, 'PyTorch install failed');
            return failWithVerify(
                'pytorch-install-failed',
                'Failed to install PyTorch stack for tool.',
                [`Tool path: ${dir}`],
                ['Retry install with active internet connection.']
            );
        }
        const torchInfo = getInstalledTorchInfo(py);
        if (torchInfo) {
            log(`${c.green}✓${c.reset}`, `Installed torch ${torchInfo.version} (CUDA ${torchInfo.cuda})`);
        }
        // Create marker file to skip check next time
        try {
            writeFileSync(torchMarker, 'installed');
        } catch { }
    } else {
        log('✓', 'PyTorch already installed. Skipping.');
    }

    // 3. Install Requirements (if requirements.txt exists)
    if (existsSync(join(dir, 'requirements.txt'))) {
        // Check if requirements have changed since last install
        const reqFile = join(dir, 'requirements.txt');
        const markerFile = join(dir, '.requirements_installed');

        let needsInstall = true;
        if (existsSync(markerFile)) {
            try {
                const reqContent = readFileSync(reqFile, 'utf-8');
                const markerContent = readFileSync(markerFile, 'utf-8');
                // Simple hash comparison to detect changes
                const reqHash = Bun.hash(reqContent).toString();
                if (markerContent === reqHash) {
                    log('✓', 'Requirements already installed. Skipping.');
                    needsInstall = false;
                }
            } catch { }
        }

        if (needsInstall) {
            log('→', 'Installing requirements...');
            if (!runInVenv('python -m pip install -r requirements.txt')) {
                return failWithVerify(
                    'requirements-install-failed',
                    'Failed to install tool requirements.',
                    [`Requirements file: ${reqFile}`],
                    ['Check pip output above and retry install.']
                );
            }
            // Save marker file
            try {
                const reqContent = readFileSync(reqFile, 'utf-8');
                const reqHash = Bun.hash(reqContent).toString();
                writeFileSync(markerFile, reqHash);
            } catch { }
        }
    }

    if (toolId === 'aitoolkit' && !restoreAIToolkitCudaPyTorch(runInVenv, py, torchMarker)) {
        return failWithVerify(
            'aitoolkit-cuda-restore-failed',
            'AI-Toolkit requirements replaced its CUDA-enabled PyTorch runtime.',
            [`Tool path: ${dir}`, `GPU: ${GPU_NAME || 'not detected'}`],
            ['Retry installation with internet access so Umbra can restore compatible CUDA wheels.']
        );
    }


    return true;
}

function setupAIToolkitUI(toolDir: string): boolean {
    const uiDir = join(toolDir, 'ui');
    const packageJsonPath = join(uiDir, 'package.json');
    if (!existsSync(packageJsonPath)) {
        return failWithVerify(
            'aitoolkit-ui-missing',
            'AI-Toolkit UI source is missing.',
            [`Expected package manifest: ${packageJsonPath}`],
            ['Repair or reinstall AI-Toolkit, then retry.']
        );
    }

    if (!hasCommand('node') || !hasCommand('npm')) {
        return failWithVerify(
            'aitoolkit-node-missing',
            'AI-Toolkit requires Node.js 20 or newer.',
            ['The node and npm commands were not both available.'],
            ['Install Node.js 20+ on the host, then retry AI-Toolkit installation.']
        );
    }

    const nodeVersionResult = spawnSync('node', ['--version'], { encoding: 'utf-8', shell: true });
    const nodeVersion = String(nodeVersionResult.stdout || nodeVersionResult.stderr || '').trim();
    const nodeMajor = Number(nodeVersion.match(/v?(\d+)/i)?.[1] || 0);
    if (nodeVersionResult.status !== 0 || nodeMajor < 20) {
        return failWithVerify(
            'aitoolkit-node-version-unsupported',
            'AI-Toolkit requires Node.js 20 or newer.',
            [`Detected Node.js version: ${nodeVersion || 'unknown'}`],
            ['Install Node.js 20+ on the host, then retry AI-Toolkit installation.']
        );
    }

    const lockPath = join(uiDir, 'package-lock.json');
    const dependencyMarkerPath = join(uiDir, '.umbra_npm_installed');
    const buildMarkerPath = join(uiDir, '.umbra_ui_built');
    const getManifestFingerprint = () => Bun.hash([
        readFileSync(packageJsonPath, 'utf-8'),
        existsSync(lockPath) ? readFileSync(lockPath, 'utf-8') : ''
    ].join('\n')).toString();
    let manifestFingerprint = getManifestFingerprint();
    const nodeModulesPath = join(uiDir, 'node_modules');
    let dependenciesReady = false;
    if (existsSync(nodeModulesPath)
        && existsSync(join(nodeModulesPath, '@types', 'node'))
        && existsSync(join(nodeModulesPath, 'typescript'))
        && existsSync(dependencyMarkerPath)) {
        try {
            dependenciesReady = readFileSync(dependencyMarkerPath, 'utf-8').trim() === manifestFingerprint;
        } catch {
            // Reinstall below when the marker cannot be read.
        }
    }

    if (!dependenciesReady) {
        log('->', `Installing AI-Toolkit UI dependencies with Node ${nodeVersion}...`);
        if (!runCmd('npm install --include=dev --no-audit --no-fund', uiDir)) {
            return failWithVerify(
                'aitoolkit-ui-install-failed',
                'AI-Toolkit UI dependency installation failed.',
                [`UI path: ${uiDir}`],
                ['Review the npm output above, then retry AI-Toolkit installation.']
            );
        }
        manifestFingerprint = getManifestFingerprint();
        try {
            writeFileSync(dependencyMarkerPath, manifestFingerprint, 'utf-8');
        } catch {
            // The marker is only a performance optimization.
        }
        log(`${c.green}OK${c.reset}`, 'AI-Toolkit UI dependencies installed');
    } else {
        log('OK', `AI-Toolkit UI dependencies already installed (Node ${nodeVersion})`);
    }

    let buildReady = false;
    if (existsSync(join(uiDir, '.next', 'BUILD_ID'))
        && existsSync(join(uiDir, 'dist', 'cron', 'worker.js'))
        && existsSync(buildMarkerPath)) {
        try {
            buildReady = readFileSync(buildMarkerPath, 'utf-8').trim() === manifestFingerprint;
        } catch {
            // Rebuild below when the marker cannot be read.
        }
    }
    if (buildReady) return true;

    log('->', 'Preparing the AI-Toolkit database and production UI...');
    const databasePath = join(toolDir, 'aitk_db.db');
    if (!existsSync(databasePath)) {
        try {
            writeFileSync(databasePath, '', 'utf-8');
        } catch (error: any) {
            return failWithVerify(
                'aitoolkit-database-create-failed',
                'Umbra could not create the AI-Toolkit database.',
                [`Database path: ${databasePath}`, `Error: ${error?.message || error}`],
                ['Check that the Tools/AI-Toolkit folder is writable, then retry installation.']
            );
        }
    }
    if (!runCmd('npm run update_db', uiDir) || !runCmd('npm run build', uiDir)) {
        return failWithVerify(
            'aitoolkit-ui-build-failed',
            'AI-Toolkit production UI build failed.',
            [`UI path: ${uiDir}`],
            ['Review the npm/build output above, then retry AI-Toolkit installation.']
        );
    }
    try {
        writeFileSync(buildMarkerPath, manifestFingerprint, 'utf-8');
    } catch {
        // The marker is only a performance optimization.
    }
    log(`${c.green}OK${c.reset}`, 'AI-Toolkit production UI is ready');
    return true;
}

function getPinnedComfyFrontendRequirementSpecs(toolDir: string): string[] {
    const requirementsPath = join(toolDir, 'requirements.txt');
    if (!existsSync(requirementsPath)) return [];

    const frontendRequirementPattern = /^(comfyui-(?:frontend-package|workflow-templates|embedded-docs)\b[^\s#;]*)/i;
    try {
        return readFileSync(requirementsPath, 'utf-8')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .map((line) => line.split('#')[0]?.trim() || '')
            .map((line) => line.match(frontendRequirementPattern)?.[1] || '')
            .filter(Boolean);
    } catch {
        return [];
    }
}

function refreshComfyFrontendPackages(toolDir: string): boolean {
    const py = getVenvPython(toolDir);
    if (!py) {
        return failWithVerify(
            'venv-not-found',
            'ComfyUI virtual environment is missing.',
            [`Tool path: ${toolDir}`],
            ['Run install or repair ComfyUI before updating.']
        );
    }

    const frontendSpecs = getPinnedComfyFrontendRequirementSpecs(toolDir);
    if (frontendSpecs.length <= 0) {
        log(`${c.yellow}âš ${c.reset}`, 'No ComfyUI frontend package pins found in requirements.txt');
        return true;
    }

    log('â†’', `Refreshing ComfyUI frontend packages: ${frontendSpecs.join(', ')}`);
    const quotedSpecs = frontendSpecs.map((spec) => `"${escapeShellDoubleQuotes(spec)}"`).join(' ');
    const ok = runCmd(`"${py}" -m pip install --upgrade --force-reinstall ${quotedSpecs}`, toolDir);
    if (!ok) {
        return failWithVerify(
            'comfyui-frontend-refresh-failed',
            'Failed to refresh ComfyUI frontend packages.',
            [`Tool path: ${toolDir}`, `Packages: ${frontendSpecs.join(', ')}`],
            ['Check pip output above and retry Update ComfyUI.']
        );
    }

    log(`${c.green}âœ“${c.reset}`, 'ComfyUI frontend packages refreshed');
    return true;
}

function getPinnedComfyRuntimeRequirementSpecs(toolDir: string): string[] {
    const requirementsPath = join(toolDir, 'requirements.txt');
    if (!existsSync(requirementsPath)) return [];

    const runtimeRequirementPattern = /^((?:comfy-aimdo)\b[^\s#;]*)/i;
    try {
        return readFileSync(requirementsPath, 'utf-8')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .map((line) => line.split('#')[0]?.trim() || '')
            .map((line) => line.match(runtimeRequirementPattern)?.[1] || '')
            .filter(Boolean);
    } catch {
        return [];
    }
}

function refreshComfyRuntimePackages(toolDir: string): boolean {
    const py = getVenvPython(toolDir);
    if (!py) {
        return failWithVerify(
            'venv-not-found',
            'ComfyUI virtual environment is missing.',
            [`Tool path: ${toolDir}`],
            ['Run install or repair ComfyUI before updating.']
        );
    }

    const runtimeSpecs = getPinnedComfyRuntimeRequirementSpecs(toolDir);
    if (runtimeSpecs.length <= 0) {
        log(`${c.yellow}WARN${c.reset}`, 'No ComfyUI runtime package pins found in requirements.txt');
        return true;
    }

    log('->', `Refreshing ComfyUI runtime packages: ${runtimeSpecs.join(', ')}`);
    const quotedSpecs = runtimeSpecs.map((spec) => `"${escapeShellDoubleQuotes(spec)}"`).join(' ');
    const ok = runCmd(`"${py}" -m pip install --upgrade ${quotedSpecs}`, toolDir);
    if (!ok) {
        return failWithVerify(
            'comfyui-runtime-refresh-failed',
            'Failed to refresh ComfyUI runtime packages.',
            [`Tool path: ${toolDir}`, `Packages: ${runtimeSpecs.join(', ')}`],
            ['Check pip output above and retry Update ComfyUI.']
        );
    }

    log(`${c.green}OK${c.reset}`, 'ComfyUI runtime packages refreshed');
    return true;
}

function refreshComfyPinnedPackages(toolDir: string): boolean {
    return refreshComfyRuntimePackages(toolDir) && refreshComfyFrontendPackages(toolDir);
}

function refreshComfySubmodules(toolDir: string, phase: string): boolean {
    log('->', 'Refreshing ComfyUI submodules...');
    const ok = runCmd('git submodule update --init --recursive', toolDir);
    if (!ok) {
        return failWithVerify(
            'comfyui-submodule-refresh-failed',
            `ComfyUI submodule refresh failed during ${phase}.`,
            [`Tool path: ${toolDir}`],
            ['Check git/network access and retry Update ComfyUI.']
        );
    }
    log(`${c.green}OK${c.reset}`, 'ComfyUI submodules refreshed');
    return true;
}

// ============================================
// COMFYUI CUSTOM NODES
// ============================================

const COMFY_NODES = [
    { name: 'ComfyUI-Manager', repo: 'https://github.com/ltdrdata/ComfyUI-Manager.git', required: true },
    { name: 'comfyui-tooling-nodes', repo: 'https://github.com/Acly/comfyui-tooling-nodes.git', required: true },
    { name: 'comfyui-inpaint-nodes', repo: 'https://github.com/Acly/comfyui-inpaint-nodes.git', required: true },
    { name: 'comfyui_controlnet_aux', repo: 'https://github.com/Fannovel16/comfyui_controlnet_aux.git', required: true },
    { name: 'ComfyUI-Inpaint-CropAndStitch', repo: 'https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git' },
    { name: 'ComfyUI_JPS-Nodes', repo: 'https://github.com/JPS-GER/ComfyUI_JPS-Nodes.git' },
    { name: 'ComfyUI_ComfyRoll_CustomNodes', repo: 'https://github.com/Suzie1/ComfyUI_ComfyRoll_CustomNodes.git' },
    { name: 'ComfyUI-Inspire-Pack', repo: 'https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git' },
    { name: 'ComfyUI-Impact-Pack', repo: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack.git' },
    { name: 'ComfyUI-Impact-Subpack', repo: 'https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git' },
    { name: 'ComfyUI_UltimateSDUpscale', repo: 'https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git', required: true },
    { name: 'Nvidia_RTX_Nodes_ComfyUI', repo: 'https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI.git', nvidiaOnly: true },
    { name: 'was-node-suite-comfyui', repo: 'https://github.com/WASasquatch/was-node-suite-comfyui.git' },
    { name: 'ComfyUI-Custom-Scripts', repo: 'https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git' }
];

// Config file for enabled nodes (shared with manage-tools.ts)
const COMFY_NODES_CONFIG = join(ROOT_DIR, 'User', 'Config', 'comfy-nodes.json');

function getEnabledNodes(): Set<string> {
    try {
        if (existsSync(COMFY_NODES_CONFIG)) {
            const config = JSON.parse(readFileSync(COMFY_NODES_CONFIG, 'utf-8'));
            return new Set(config.enabledNodes || COMFY_NODES.map(n => n.name));
        }
    } catch { }
    // Default: all nodes enabled
    return new Set(COMFY_NODES.map(n => n.name));
}

function installComfyNodeRequirements(comfyDir: string, nodePath: string, nodeName: string): boolean {
    const requirementsPath = join(nodePath, 'requirements.txt');
    if (!existsSync(requirementsPath)) return true;

    const py = getVenvPython(comfyDir);
    if (!py) {
        log('X', `Python venv is unavailable for ${nodeName} requirements`);
        return false;
    }

    const requirementsHash = Bun.hash(readFileSync(requirementsPath, 'utf-8')).toString();
    const markerPath = join(nodePath, '.umbra-requirements-installed');
    try {
        if (readFileSync(markerPath, 'utf-8').trim() === requirementsHash) return true;
    } catch {
        // Missing or stale marker: install the current requirements.
    }

    log('->', `Installing requirements for ${nodeName}...`);
    const result = spawnSync(py, ['-m', 'pip', 'install', '-r', requirementsPath], {
        cwd: comfyDir,
        stdio: 'inherit'
    });
    if (result.status !== 0) {
        log('X', `Failed to install requirements for ${nodeName}`);
        return false;
    }

    writeFileSync(markerPath, `${requirementsHash}\n`, 'utf-8');
    return true;
}

function installComfyNodes(comfyDir: string): boolean {
    const nodesDir = join(comfyDir, 'custom_nodes');
    if (!existsSync(nodesDir)) mkdirSync(nodesDir, { recursive: true });

    console.log(`\n${c.cyan}━━━ Installing ComfyUI Custom Nodes ━━━${c.reset}`);
    syncUmbraNodesToComfy(nodesDir);
    seedComfyExampleWorkflows(comfyDir);

    // Get enabled nodes from config
    const enabledNodes = getEnabledNodes();

    for (const node of COMFY_NODES) {
        if ('nvidiaOnly' in node && node.nvidiaOnly && !GPU_NAME) {
            log('âˆ’', `${node.name} ${c.dim}(skipped - NVIDIA GPU not detected)${c.reset}`);
            continue;
        }
        // Skip if not enabled (unless required)
        if (!enabledNodes.has(node.name) && !('required' in node && node.required)) {
            log('−', `${node.name} ${c.dim}(skipped - not selected)${c.reset}`);
            continue;
        }

        const nodePath = join(nodesDir, node.name);
        if (!existsSync(nodePath)) {
            log('→', `Installing ${node.name}...`);
            try {
                execSync(`git clone ${node.repo} ${node.name}`, { cwd: nodesDir, stdio: 'ignore' });
                configureGitRepoForPortableUpdates(nodePath);

                log(`${c.green}✓${c.reset}`, `${node.name} installed`);
            } catch {
                log(`${c.red}✗${c.reset}`, `Failed to install ${node.name}`);
            }
        } else {
            // Check for updates
            try {
                configureGitRepoForPortableUpdates(nodePath);
                execSync('git fetch', { cwd: nodePath, stdio: 'ignore' });
                const status = execSync('git status -uno', { cwd: nodePath, encoding: 'utf-8' });
                if (status.includes('behind')) {
                    log('→', `Updating ${node.name}...`);
                    execSync('git pull', { cwd: nodePath, stdio: 'ignore' });
                    log(`${c.green}✓${c.reset}`, `${node.name} updated`);
                } else {
                    log('✓', `${node.name} is up to date`);
                }
            } catch { }
        }
    }

    let requiredFailure = false;
    for (const node of COMFY_NODES) {
        if (!('required' in node && node.required)) continue;
        const nodePath = join(nodesDir, node.name);
        if (!existsSync(nodePath)) {
            log('X', `Required node ${node.name} is missing`);
            requiredFailure = true;
            continue;
        }
        if (!installComfyNodeRequirements(comfyDir, nodePath, node.name)) {
            requiredFailure = true;
        }
    }

    // Confirm Umbra-Nodes exists in ComfyUI custom_nodes.
    const umbraNodesPath = join(nodesDir, 'Umbra-Nodes');
    if (hasUmbraNodesPayload(umbraNodesPath)) {
        log(`${c.green}✓${c.reset}`, 'Umbra-Nodes detected');
    } else {
        log(`${c.yellow}⚠${c.reset}`, 'Umbra-Nodes not found (will be created by Umbra Studio)');
    }

    if (!hasUmbraNodesPayload(umbraNodesPath)) requiredFailure = true;
    if (requiredFailure) {
        return failWithVerify(
            'comfy-required-nodes-failed',
            'One or more required ComfyUI custom nodes failed to install.',
            [`ComfyUI path: ${comfyDir}`],
            ['Review the node requirement error above, then retry the ComfyUI custom nodes action.']
        );
    }
    return true;
}

function createRootShortcut(name: string, target: string) {
    const shortcutPath = join(ROOT_DIR, name);
    try {
        if (!existsSync(target)) {
            mkdirSync(target, { recursive: true });
        }

        if (existsSync(shortcutPath)) {
            const current = lstatSync(shortcutPath);
            if (!current.isSymbolicLink()) {
                log('->', `${name} already exists; leaving it in place`);
                return;
            }
            unlinkSync(shortcutPath);
        }

        symlinkSync(target, shortcutPath, IS_WINDOWS ? 'junction' : 'dir');
        log(`${c.green}OK${c.reset}`, `${name} -> ${target}`);
    } catch (error: any) {
        log(`${c.yellow}!${c.reset}`, `Could not create ${name}: ${error?.message || error}`);
    }
}

function createToolRootShortcuts() {
    const comfyDir = findToolPath(CONFIG.comfyui.search) || join(TOOLS_DIR, CONFIG.comfyui.dir);
    createRootShortcut('ComfyUI-Models', join(comfyDir, 'models'));
    createRootShortcut('ComfyUI-Output', join(comfyDir, 'output'));
    createRootShortcut('ComfyUI-Nodes', join(comfyDir, 'custom_nodes'));
}

// ============================================
// MAIN PROCESS
// ============================================


async function processTool(key: keyof typeof CONFIG, autoInstall = false, nonInteractive = false): Promise<boolean> {
    const cfg = CONFIG[key];
    console.log('\n' + c.cyan + '--- Processing ' + cfg.name + ' ---' + c.reset);

    let toolDir = findToolPath(cfg.search);

    if (!toolDir) {
        if (!autoInstall) {
            const answer = await prompt('  ' + cfg.name + ' is not installed. Install? [y/N]: ');
            const doInstall = answer?.toLowerCase().startsWith('y') || false;
            if (!doInstall) {
                log('->', 'Skipping installation.');
                return true;
            }
        }

        log('->', 'Installing...');
        toolDir = join(TOOLS_DIR, cfg.dir);
        mkdirSync(toolDir, { recursive: true });
        if (cfg.repo) {
            if (!cloneRepo(cfg.repo, toolDir, cfg.branch)) return false;
        }
    } else {
        log('OK', 'Found at: ' + toolDir);

        if (cfg.repo && !hasValidGitCheckout(toolDir)) {
            log('->', cfg.name + ' source missing in existing folder. Downloading repository...');
            if (!cloneRepo(cfg.repo, toolDir, cfg.branch)) return false;
        } else if (cfg.repo && hasValidGitCheckout(toolDir)) {
            if (!ensureRepoSourceAndBranch(toolDir, cfg.repo, cfg.branch)) return false;
            if (!nonInteractive) {
                await checkUpdates(toolDir, cfg.repo);
            }
        }
    }

    const setupOk = setupPythonEnv(toolDir, cfg.id);

    if (!setupOk) {
        log(c.red + 'X' + c.reset, cfg.name + ' setup failed');
        return failWithVerify(
            'tool-setup-failed',
            cfg.name + ' setup failed verification.',
            ['Tool path: ' + toolDir],
            ['Review the install logs above and retry.'],
            false
        );
    }

    if (key === 'comfyui') {
        if (!refreshComfyPinnedPackages(toolDir)) return false;
        if (!installComfyNodes(toolDir)) return false;
        createRootShortcut('ComfyUI-Models', join(toolDir, 'models'));
        createRootShortcut('ComfyUI-Output', join(toolDir, 'output'));
    } else if (key === 'aitoolkit') {
        ensureAIToolkitDatasetsLink(toolDir);
        if (!setupAIToolkitUI(toolDir)) return false;
    }


    log(c.green + 'OK' + c.reset, cfg.name + ' is ready');
    return true;
}

async function updateTool(key: keyof typeof CONFIG) {
    const cfg = CONFIG[key];
    const toolDir = findToolPath(cfg.search);

    if (!toolDir) {
        log(c.yellow + '!' + c.reset, cfg.name + ' is not installed; installing now...');
        const installed = await processTool(key, true, true);
        if (!installed) exitWithExistingVerifyFailure();
        return;
    }

    if (cfg.repo && !hasValidGitCheckout(toolDir)) {
        log('->', cfg.name + ' repository missing. Bootstrapping source checkout...');
        if (!cloneRepo(cfg.repo, toolDir, cfg.branch)) {
            log(c.red + 'X' + c.reset, cfg.name + ' clone failed');
            exitWithExistingVerifyFailure();
        }
    }

    if (cfg.repo && hasValidGitCheckout(toolDir)) {
        if (!ensureRepoSourceAndBranch(toolDir, cfg.repo, cfg.branch)) {
            exitWithExistingVerifyFailure();
        }
        log('->', 'Updating ' + cfg.name + '...');
        const pullCmd = cfg.branch ? `git pull --rebase --autostash origin "${cfg.branch}"` : 'git pull --rebase --autostash';
        const pullOk = pullRepoWithRecovery(toolDir, cfg.branch);
        if (!pullOk) {
            exitWithVerifyFailure(
                `${key}-update-pull-failed`,
                `${cfg.name} update failed during git pull.`,
                [`Tool path: ${toolDir}`, `Command: ${pullCmd}`],
                [
                    'Confirm no process is locking repository files, then retry.',
                    'If this persists, run a reinstall for this tool.'
                ]
            );
        }
        if (key === 'comfyui') {
            if (!refreshComfySubmodules(toolDir, 'update')) {
                exitWithExistingVerifyFailure();
            }
        } else {
            runCmd('git submodule update --init --recursive', toolDir, true);
        }
    }

    const setupOk = setupPythonEnv(toolDir, cfg.id);

    if (!setupOk) {
        log(c.red + 'X' + c.reset, cfg.name + ' setup failed');
        exitWithExistingVerifyFailure();
    }

    if (key === 'comfyui') {
        if (!refreshComfyPinnedPackages(toolDir)) {
            exitWithExistingVerifyFailure();
        }
        if (!installComfyNodes(toolDir)) {
            exitWithExistingVerifyFailure();
        }
    } else if (key === 'aitoolkit') {
        ensureAIToolkitDatasetsLink(toolDir);
        if (!setupAIToolkitUI(toolDir)) {
            exitWithExistingVerifyFailure();
        }
    }

    createToolRootShortcuts();
    log(c.green + 'OK' + c.reset, cfg.name + ' updated');
}

function isSafeGitRef(ref: string): boolean {
    return /^[A-Za-z0-9._/-]+$/.test(ref) && !ref.startsWith('-');
}

const COMFY_USER_DATA_ENTRIES = [
    'models',
    'input',
    'output',
    'user',
    'extra_model_paths.yaml',
    'comfy.settings.json'
];

function movePathWithFallback(sourcePath: string, targetPath: string): boolean {
    try {
        ensureDir(dirname(targetPath));
        renameSync(sourcePath, targetPath);
        return true;
    } catch {
        try {
            const sourceStats = lstatSync(sourcePath);
            if (sourceStats.isDirectory()) {
                cpSync(sourcePath, targetPath, { recursive: true, force: true });
            } else {
                cpSync(sourcePath, targetPath, { force: true });
            }
            rmSync(sourcePath, { recursive: true, force: true });
            return true;
        } catch {
            return false;
        }
    }
}

function moveComfyUserDataEntries(
    sourceRoot: string,
    targetRoot: string,
    entries: string[],
    replaceExistingTarget = false
): string[] {
    const moved: string[] = [];
    ensureDir(targetRoot);

    for (const entry of entries) {
        const sourcePath = join(sourceRoot, entry);
        if (!existsSync(sourcePath)) continue;

        const targetPath = join(targetRoot, entry);
        if (replaceExistingTarget && existsSync(targetPath)) {
            rmSync(targetPath, { recursive: true, force: true });
        }

        if (!movePathWithFallback(sourcePath, targetPath)) {
            throw new Error(`Failed to move preserved entry: ${entry}`);
        }
        moved.push(entry);
    }

    return moved;
}

async function setComfyUIVersion(ref: string) {
    const targetRef = String(ref || '').trim();
    if (!targetRef) {
        exitWithVerifyFailure(
            'missing-version-ref',
            'No ComfyUI version reference was provided.',
            ['Expected a git tag/branch/commit reference.'],
            ['Select a version in settings and retry.']
        );
    }

    if (!isSafeGitRef(targetRef)) {
        exitWithVerifyFailure(
            'invalid-version-ref',
            'Invalid ComfyUI version reference.',
            [`Reference: ${targetRef}`],
            ['Use a valid git ref (letters, numbers, dot, slash, dash, underscore).']
        );
    }

    const cfg = CONFIG.comfyui;
    let toolDir = findToolPath(cfg.search);
    if (!toolDir) {
        toolDir = join(TOOLS_DIR, cfg.dir);
        ensureDir(toolDir);
        log('→', 'ComfyUI is not installed. Installing selected version from scratch...');
    }
    if (!cfg.repo) {
        exitWithVerifyFailure(
            'comfyui-repo-missing',
            'ComfyUI repository configuration is missing.',
            [`Tool path: ${toolDir}`],
            ['Reinstall or repair Umbra Studio tool configuration and retry.']
        );
    }

    const escapedRef = targetRef.replace(/"/g, '\\"');
    if (hasValidGitCheckout(toolDir)) {
        configureGitRepoForPortableUpdates(toolDir);
        log('→', 'Fetching ComfyUI references...');
        runCmd('git fetch --tags --force --prune origin', toolDir, true);
        const hasRef = runCmd(`git rev-parse --verify --quiet "${escapedRef}^{commit}"`, toolDir, true);
        if (!hasRef) {
            exitWithVerifyFailure(
                'comfyui-version-not-found',
                'Requested ComfyUI version reference was not found.',
                [`Reference: ${targetRef}`],
                ['Refresh version list and choose a valid version.']
            );
        }
    } else {
        log('→', 'ComfyUI git metadata missing. Will validate target ref after clean clone.');
    }

    const preserveRoot = join(ROOT_DIR, 'User', 'Config', 'ComfyUI-Preserve');
    const preserveDir = join(preserveRoot, `switch-${Date.now()}-${process.pid}`);
    let preservedEntries: string[] = [];
    let preserveRestoreStatus = '';

    try {
        log('→', 'Preserving ComfyUI user data before clean source rebuild...');
        ensureDir(preserveRoot);
        ensureDir(preserveDir);
        preservedEntries = moveComfyUserDataEntries(toolDir, preserveDir, COMFY_USER_DATA_ENTRIES);
        if (preservedEntries.length > 0) {
            log(`${c.green}✓${c.reset}`, `Preserved user data: ${preservedEntries.join(', ')}`);
        } else {
            log('→', 'No existing ComfyUI user data folders/files needed preservation.');
        }

        log('→', 'Removing current ComfyUI source checkout...');
        rmSync(toolDir, { recursive: true, force: true });
        ensureDir(toolDir);

        log('→', 'Cloning clean ComfyUI repository...');
        if (!cloneRepo(cfg.repo, toolDir, cfg.branch)) {
            throw new Error('ComfyUI source clone failed.');
        }

        log('→', 'Refreshing ComfyUI git references...');
        configureGitRepoForPortableUpdates(toolDir);
        runCmd('git fetch --tags --force --prune origin', toolDir, true);
        const hasRefAfterClone = runCmd(`git rev-parse --verify --quiet "${escapedRef}^{commit}"`, toolDir, true);
        if (!hasRefAfterClone) {
            throw new Error(`Requested ComfyUI version reference was not found after clone: ${targetRef}`);
        }

        log('→', `Checking out ${targetRef}...`);
        if (!runCmd(`git checkout -f "${escapedRef}"`, toolDir)) {
            throw new Error(`Failed to checkout requested ComfyUI version: ${targetRef}`);
        }

        if (!refreshComfySubmodules(toolDir, 'version switch')) {
            throw new Error('ComfyUI submodule refresh failed.');
        }

        if (preservedEntries.length > 0) {
            const restoredEntries = moveComfyUserDataEntries(preserveDir, toolDir, preservedEntries, true);
            preserveRestoreStatus = `Restored preserved user data: ${restoredEntries.join(', ')}`;
            log(`${c.green}✓${c.reset}`, preserveRestoreStatus);
        }

        rmSync(preserveDir, { recursive: true, force: true });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');
        let recoveryNote = '';
        try {
            if (preservedEntries.length > 0) {
                ensureDir(toolDir);
                const recoveredEntries = moveComfyUserDataEntries(preserveDir, toolDir, preservedEntries, true);
                if (recoveredEntries.length > 0) {
                    recoveryNote = `Recovered preserved user data after failure: ${recoveredEntries.join(', ')}`;
                    log(`${c.yellow}⚠${c.reset}`, recoveryNote);
                }
            }
            if (existsSync(preserveDir)) {
                rmSync(preserveDir, { recursive: true, force: true });
            }
        } catch {
            recoveryNote = `Preserved user data remains in backup folder: ${preserveDir}`;
        }

        const details = [`Reference: ${targetRef}`, errorMessage];
        if (recoveryNote) details.push(recoveryNote);
        exitWithVerifyFailure(
            'comfyui-version-switch-failed',
            'ComfyUI version switch failed during clean source rebuild.',
            details,
            [
                'Retry with another version or run update-comfyui.',
                recoveryNote || 'If needed, reinstall ComfyUI from settings.'
            ]
        );
    }

    const setupOk = setupPythonEnv(toolDir, cfg.id);
    if (!setupOk) {
        log(c.red + '✗' + c.reset, 'ComfyUI setup failed after version switch');
        exitWithExistingVerifyFailure();
    }

    if (!refreshComfyPinnedPackages(toolDir)) {
        log(c.red + 'X' + c.reset, 'ComfyUI pinned package refresh failed after version switch');
        exitWithExistingVerifyFailure();
    }

    if (!installComfyNodes(toolDir)) {
        exitWithExistingVerifyFailure();
    }
    createRootShortcut('ComfyUI-Models', join(toolDir, 'models'));
    createRootShortcut('ComfyUI-Output', join(toolDir, 'output'));
    createToolRootShortcuts();

    const currentCommit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: toolDir,
        encoding: 'utf-8'
    });
    const resolvedCommit = currentCommit.status === 0 ? currentCommit.stdout.trim() : '';
    log(`${c.green}✓${c.reset}`, `ComfyUI switched to ${targetRef}${resolvedCommit ? ` (${resolvedCommit})` : ''}`);
}

function updatePyTorchForTool(key: keyof typeof CONFIG) {
    const cfg = CONFIG[key];
    const toolDir = findToolPath(cfg.search);
    if (!toolDir) {
        log(`${c.red}✗${c.reset}`, `${cfg.name} not found. Install it first.`);
        exitWithVerifyFailure(
            'tool-not-found',
            `${cfg.name} is not installed.`,
            [`Expected tool directory under: ${TOOLS_DIR}`],
            ['Run install action for this tool first.']
        );
    }

    const py = getVenvPython(toolDir);
    if (!py) {
        log(`${c.red}✗${c.reset}`, `${cfg.name} venv not found. Install it first.`);
        exitWithVerifyFailure(
            'venv-not-found',
            `${cfg.name} virtual environment is missing.`,
            [`Tool path: ${toolDir}`],
            ['Run install action for this tool first.']
        );
    }

    log('→', `Updating ${cfg.name} to latest available PyTorch...`);
    if (!upgradePyTorchPackages((pipCmd) => runCmd(`"${py}" -m ${pipCmd}`, toolDir))) {
        log(`${c.red}✗${c.reset}`, 'PyTorch update failed');
        exitWithVerifyFailure(
            'pytorch-update-failed',
            `Failed to update PyTorch for ${cfg.name}.`,
            [`Tool path: ${toolDir}`],
            ['Check network access and rerun update.']
        );
    }
    const torchInfo = getInstalledTorchInfo(py);
    if (torchInfo) {
        log(`${c.green}✓${c.reset}`, `Now using torch ${torchInfo.version} (CUDA ${torchInfo.cuda})`);
    }
    log(`${c.green}✓${c.reset}`, `${cfg.name} PyTorch stack updated`);
}

function installSageAttentionForComfyUI() {
    const cfg = CONFIG.comfyui;
    const toolDir = findToolPath(cfg.search);
    if (!toolDir) {
        log(`${c.red}âœ—${c.reset}`, `${cfg.name} not found. Install it first.`);
        exitWithVerifyFailure(
            'tool-not-found',
            `${cfg.name} is not installed.`,
            [`Expected tool directory under: ${TOOLS_DIR}`],
            ['Run install action for this tool first.']
        );
    }

    const py = getVenvPython(toolDir);
    if (!py) {
        log(`${c.red}âœ—${c.reset}`, `${cfg.name} venv not found. Install it first.`);
        exitWithVerifyFailure(
            'venv-not-found',
            `${cfg.name} virtual environment is missing.`,
            [`Tool path: ${toolDir}`],
            ['Run install action for this tool first.']
        );
    }

    log('â†’', 'Installing SageAttention prerequisites...');
    if (!runCmd(`"${py}" -m pip install --upgrade pip "setuptools<82" wheel packaging ninja`, toolDir)) {
        exitWithVerifyFailure(
            'sageattention-prereqs-failed',
            'Failed to install SageAttention prerequisites.',
            [`Tool path: ${toolDir}`],
            ['Check pip output above and retry install.']
        );
    }

    // Remove stale wheel installs first so fallback resolution doesn't leave old 1.x builds behind.
    runCmdAllowFailure(`"${py}" -m pip uninstall -y sageattention`, toolDir);

    // Always try latest upstream source first, then pre-release/latest wheel channels.
    const candidates = [
        `"${py}" -m pip install --upgrade --no-cache-dir --no-build-isolation git+https://github.com/thu-ml/SageAttention.git`,
        `"${py}" -m pip install --upgrade --pre --no-cache-dir \"sageattention>=2.0.0\"`
    ];

    const torchCudaResult = runCmdCapture(`"${py}" -c "import torch; print(torch.version.cuda or 'cpu')"`, toolDir);
    const torchCuda = String(torchCudaResult.stdout || '').trim();
    const wheelUrl = selectSageAttentionWindowsWheel(torchCuda);
    if (wheelUrl) {
        candidates.push(`"${py}" -m pip install --upgrade --no-cache-dir "${wheelUrl}"`);
    }

    let installed = false;
    for (const cmd of candidates) {
        log('â†’', `Trying: ${cmd}`);
        if (runCmdAllowFailure(cmd, toolDir)) {
            installed = true;
            break;
        }
    }

    if (!installed) {
        exitWithVerifyFailure(
            'sageattention-install-failed',
            'Failed to install SageAttention package.',
            [`Tool path: ${toolDir}`],
            [
                'Retry the action with internet access.',
                'If this persists, align local CUDA toolkit with the CUDA version used by ComfyUI torch (for example cu130 torch expects CUDA 13.x toolkit).'
            ]
        );
    }

    const tritonCandidates = IS_WINDOWS
        ? [
            `"${py}" -m pip install --upgrade triton-windows`,
            `"${py}" -m pip install --upgrade triton-windows==3.6.0.post26`
        ]
        : [
            `"${py}" -m pip install --upgrade triton`
        ];
    let tritonInstalled = false;
    for (const cmd of tritonCandidates) {
        log('â†’', `Trying Triton runtime: ${cmd}`);
        if (runCmdAllowFailure(cmd, toolDir)) {
            tritonInstalled = true;
            break;
        }
    }
    if (!tritonInstalled) {
        exitWithVerifyFailure(
            'sageattention-triton-install-failed',
            'Failed to install Triton runtime required by SageAttention.',
            [`Tool path: ${toolDir}`, `Platform: ${process.platform}`],
            [
                'Retry the action with internet access.',
                'On Windows, ensure triton-windows wheel is available for your Python version.'
            ]
        );
    }

    const verifyCmd = `"${py}" -c "import importlib.metadata as md; from sageattention import core as c; required=('per_thread_int8_triton','per_warp_int8_cuda','per_block_int8_triton','per_channel_fp8','get_cuda_arch_versions','attn_false'); missing=[name for name in required if not hasattr(c, name)]; archs = c.get_cuda_arch_versions() if hasattr(c, 'get_cuda_arch_versions') else None; print('SAGE_VERSION=' + md.version('sageattention')); print('SAGE_MISSING=' + ','.join(missing)); print('SAGE_ARCHS=' + str(archs)); print('SAGEATTENTION_LTX2_OK' if (not missing and archs is not None) else 'SAGEATTENTION_LTX2_NOT_READY')"`;
    const verifyResult = spawnSync(py, [
        '-c',
        "import importlib.metadata as md; from sageattention import core as c; required=('per_thread_int8_triton','per_warp_int8_cuda','per_block_int8_triton','per_channel_fp8','get_cuda_arch_versions','attn_false'); missing=[name for name in required if not hasattr(c, name)]; archs = c.get_cuda_arch_versions() if hasattr(c, 'get_cuda_arch_versions') else None; print('SAGE_VERSION=' + md.version('sageattention')); print('SAGE_MISSING=' + ','.join(missing)); print('SAGE_ARCHS=' + str(archs)); print('SAGEATTENTION_LTX2_OK' if (not missing and archs is not None) else 'SAGEATTENTION_LTX2_NOT_READY')"
    ], {
        cwd: toolDir,
        encoding: 'utf-8',
        shell: false,
        timeout: 45000,
    });
    const verifyOutput = `${verifyResult.stdout || ''}\n${verifyResult.stderr || ''}`.trim();
    if (verifyOutput) {
        log('->', verifyOutput);
    }
    if (verifyResult.status !== 0 || !verifyOutput.includes('SAGEATTENTION_LTX2_OK')) {
        exitWithVerifyFailure(
            'sageattention-verify-failed',
            'SageAttention installed but does not satisfy LTX2 requirements.',
            [`Tool path: ${toolDir}`, verifyOutput || 'No verification output captured.'],
            [
                'Re-run install SageAttention action to retry latest upstream source build.',
                'Confirm Python 3.11, CUDA-compatible torch, and triton runtime are available in ComfyUI venv.'
            ]
        );
    }

    log(`${c.green}âœ“${c.reset}`, 'SageAttention dependencies installed for ComfyUI');
    log('â†’', 'Restart ComfyUI to apply SageAttention runtime changes.');
}

function installSageAttentionForComfyUIEnhanced() {
    const cfg = CONFIG.comfyui;
    const toolDir = findToolPath(cfg.search);
    if (!toolDir) {
        log(`${c.red}X${c.reset}`, `${cfg.name} not found. Install it first.`);
        exitWithVerifyFailure(
            'tool-not-found',
            `${cfg.name} is not installed.`,
            [`Expected tool directory under: ${TOOLS_DIR}`],
            ['Run install action for this tool first.']
        );
    }

    const py = getVenvPython(toolDir);
    if (!py) {
        log(`${c.red}X${c.reset}`, `${cfg.name} venv not found. Install it first.`);
        exitWithVerifyFailure(
            'venv-not-found',
            `${cfg.name} virtual environment is missing.`,
            [`Tool path: ${toolDir}`],
            ['Run install action for this tool first.']
        );
    }

    log('->', 'Installing SageAttention prerequisites...');
    if (!runCmd(`"${py}" -m pip install --upgrade pip "setuptools<82" wheel packaging ninja`, toolDir)) {
        exitWithVerifyFailure(
            'sageattention-prereqs-failed',
            'Failed to install SageAttention prerequisites.',
            [`Tool path: ${toolDir}`],
            ['Check pip output above and retry install.']
        );
    }

    runCmdAllowFailure(`"${py}" -m pip uninstall -y sageattention`, toolDir);

    const candidates = [
        `"${py}" -m pip install --upgrade --no-cache-dir --no-build-isolation git+https://github.com/thu-ml/SageAttention.git`,
        `"${py}" -m pip install --upgrade --pre --no-cache-dir \"sageattention>=2.0.0\"`
    ];

    const torchCudaResult = runCmdCapture(`"${py}" -c "import torch; print(torch.version.cuda or 'cpu')"`, toolDir);
    const torchCuda = String(torchCudaResult.stdout || '').trim();
    const wheelUrl = selectSageAttentionWindowsWheel(torchCuda);
    if (wheelUrl) {
        candidates.push(`"${py}" -m pip install --upgrade --no-cache-dir "${wheelUrl}"`);
    }

    let installed = false;
    let lastInstallFailure = '';
    for (const cmd of candidates) {
        log('->', `Trying: ${cmd}`);
        const result = runCmdCapture(cmd, toolDir, IS_WINDOWS);
        if (result.stdout.trim()) process.stdout.write(result.stdout);
        if (result.stderr.trim()) process.stderr.write(result.stderr);
        if (result.ok) {
            installed = true;
            break;
        }
        lastInstallFailure = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    }

    if (!installed) {
        const diag = getSageInstallDiagnostics(py, toolDir);
        const details = [
            `Tool path: ${toolDir}`,
            `Detected torch CUDA: ${diag.torchCuda}`,
            `Detected local CUDA toolkit: ${diag.cudaToolkit}`,
            `MSVC compiler (cl.exe) available in current shell: ${diag.clAvailable ? 'yes' : 'no'}`,
            `MSVC compiler (cl.exe) available via VsDevCmd: ${diag.clAvailableViaVsDevCmd ? 'yes' : 'no'}`,
            `VsDevCmd path: ${diag.vsDevCmdPath}`
        ];
        const cudaMismatch =
            diag.torchCuda !== 'unknown'
            && diag.torchCuda !== 'cpu'
            && diag.cudaToolkit !== 'unknown'
            && diag.cudaToolkit !== 'not-found'
            && !diag.torchCuda.startsWith(diag.cudaToolkit.split('.')[0] + '.');
        if (cudaMismatch) details.push('Detected CUDA toolkit and torch CUDA do not match.');
        if (lastInstallFailure) details.push(`Last install error: ${lastInstallFailure.split('\n').slice(-8).join(' | ')}`);
        exitWithVerifyFailure(
            'sageattention-install-failed',
            'Failed to install SageAttention package.',
            details,
            [
                'Ensure Visual Studio Build Tools (Desktop C++) are installed so cl.exe is available.',
                'Align local CUDA toolkit with the CUDA version used by ComfyUI torch (for example cu130 torch expects CUDA 13.x toolkit).',
                'Then rerun Install SageAttention.'
            ]
        );
    }

    const tritonCandidates = IS_WINDOWS
        ? [
            `"${py}" -m pip install --upgrade triton-windows`,
            `"${py}" -m pip install --upgrade triton-windows==3.6.0.post26`
        ]
        : [
            `"${py}" -m pip install --upgrade triton`
        ];
    let tritonInstalled = false;
    for (const cmd of tritonCandidates) {
        log('->', `Trying Triton runtime: ${cmd}`);
        if (runCmdAllowFailure(cmd, toolDir)) {
            tritonInstalled = true;
            break;
        }
    }
    if (!tritonInstalled) {
        exitWithVerifyFailure(
            'sageattention-triton-install-failed',
            'Failed to install Triton runtime required by SageAttention.',
            [`Tool path: ${toolDir}`, `Platform: ${process.platform}`],
            [
                'Retry the action with internet access.',
                'On Windows, ensure triton-windows wheel is available for your Python version.'
            ]
        );
    }

    const verifyResult = spawnSync(py, [
        '-c',
        "import importlib.metadata as md; from sageattention import core as c; required=('per_thread_int8_triton','per_warp_int8_cuda','per_block_int8_triton','per_channel_fp8','get_cuda_arch_versions','attn_false'); missing=[name for name in required if not hasattr(c, name)]; archs = c.get_cuda_arch_versions() if hasattr(c, 'get_cuda_arch_versions') else None; print('SAGE_VERSION=' + md.version('sageattention')); print('SAGE_MISSING=' + ','.join(missing)); print('SAGE_ARCHS=' + str(archs)); print('SAGEATTENTION_LTX2_OK' if (not missing and archs is not None) else 'SAGEATTENTION_LTX2_NOT_READY')"
    ], {
        cwd: toolDir,
        encoding: 'utf-8',
        shell: false,
        timeout: 45000,
    });
    const verifyOutput = `${verifyResult.stdout || ''}\n${verifyResult.stderr || ''}`.trim();
    if (verifyOutput) log('->', verifyOutput);
    if (verifyResult.status !== 0 || !verifyOutput.includes('SAGEATTENTION_LTX2_OK')) {
        exitWithVerifyFailure(
            'sageattention-verify-failed',
            'SageAttention installed but does not satisfy LTX2 requirements.',
            [`Tool path: ${toolDir}`, verifyOutput || 'No verification output captured.'],
            [
                'Re-run install SageAttention action to retry latest upstream source build.',
                'Confirm Python 3.11, CUDA-compatible torch, and triton runtime are available in ComfyUI venv.'
            ]
        );
    }

    log(`${c.green}OK${c.reset}`, 'SageAttention dependencies installed for ComfyUI');
    log('->', 'Restart ComfyUI to apply SageAttention runtime changes.');
}

async function main() {
    console.log(`\n${c.cyan}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${c.reset}`);
    console.log(`${c.cyan}â•‘${c.reset}  ${c.bold}Umbra Studio - Universal Setup${c.reset}                  ${c.cyan}â•‘${c.reset}`);
    console.log(`${c.cyan}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${c.reset}\n`);

    const arg = process.argv[2]?.toLowerCase();
    const pythonNotRequiredActions = new Set([
        'shortcuts'
    ]);

    if (!runPlatformPreflight()) {
        exitWithExistingVerifyFailure();
    }

    if (!arg || !pythonNotRequiredActions.has(arg)) {
        if (!findPython311Runtime()) {
            exitWithExistingVerifyFailure();
        }
        log(`${c.green}âœ“${c.reset}`, `Using Python 3.11 (${PYTHON_VERSION}): ${PYTHON_CMD}`);
    } else {
        log('->', 'Python runtime bootstrap skipped for desktop-only action');
    }

    if (!arg || !pythonNotRequiredActions.has(arg)) {
        detectGPU();
        if (GPU_NAME) {
            log(`${c.green}âœ“${c.reset}`, `Detected GPU: ${GPU_NAME}`);
            if (isBlackwellGPU()) {
                log('->', 'Blackwell GPU detected - will use CUDA 13.0');
            }
        }
    }

    if (!existsSync(TOOLS_DIR)) mkdirSync(TOOLS_DIR);
    const runRequiredTool = async (toolKey: keyof typeof CONFIG, autoInstall = false, nonInteractive = false) => {
        const ok = await processTool(toolKey, autoInstall, nonInteractive);
        if (!ok) exitWithExistingVerifyFailure();
    };

    if (arg === 'all') {
        if (!setupUmbraPythonHelpersVenv()) exitWithExistingVerifyFailure();
        await runRequiredTool('comfyui', true, true);

        createToolRootShortcuts();
    } else if (arg === 'python-helpers' || arg === 'waifu-tagger') {
        if (!setupUmbraPythonHelpersVenv()) exitWithExistingVerifyFailure();
    } else if (arg === 'shortcuts') {
        createToolRootShortcuts();
        log(`${c.green}âœ“${c.reset}`, 'Tool shortcuts repaired');
    } else if (arg === 'comfy-nodes') {
        const comfyDir = findToolPath(CONFIG.comfyui.search);
        if (!comfyDir) {
            log(`${c.red}âœ—${c.reset}`, 'ComfyUI not found');
            exitWithVerifyFailure(
                'comfyui-not-found',
                'ComfyUI install not found for custom node setup.',
                [`Expected directory under: ${TOOLS_DIR}`],
                ['Install ComfyUI first.']
            );
        }
        if (!installComfyNodes(comfyDir)) {
            exitWithExistingVerifyFailure();
        }
    } else if (arg === 'update-comfyui') {
        await updateTool('comfyui');
    } else if (arg === 'update-aitoolkit') {
        await updateTool('aitoolkit');
    } else if (arg === 'set-comfyui-version' || arg === 'downgrade-comfyui') {
        const targetRef = String(process.argv[3] || '').trim();
        await setComfyUIVersion(targetRef);
    } else if (arg === 'update-pytorch-comfyui') {
        updatePyTorchForTool('comfyui');
    } else if (arg === 'update-pytorch-aitoolkit') {
        updatePyTorchForTool('aitoolkit');
    } else if (arg === 'install-sageattention-comfyui' || arg === 'install-sage-attention-comfyui') {
        installSageAttentionForComfyUIEnhanced();
    } else if (arg && arg in CONFIG) {
        await runRequiredTool(arg as keyof typeof CONFIG, true, true);
        createToolRootShortcuts();
    } else {
        await runRequiredTool('comfyui');
        createToolRootShortcuts();
    }

    console.log('UMBRA_VERIFY_OK|setup-tools');
    console.log(`\n${c.green}All operations complete!${c.reset}\n`);
}

main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    setVerifyFailure(
        'unexpected-exception',
        'Installer crashed unexpectedly.',
        [message],
        ['Review the stack trace above and retry the operation.'],
        false
    );
    printVerifyFailureSummary();
    process.exit(1);
});
