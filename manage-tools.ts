#!/usr/bin/env bun
/**
 * Umbra Studio - Interactive Tool Manager
 * 
 * Features:
 * - Install/uninstall tools
 * - Check for updates
 * - Update PyTorch/CUDA
 * - Launch Umbra Studio
 */

import { join } from 'path';
import { existsSync, statSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { execSync, spawnSync } from 'child_process';
import * as readline from 'readline';

const COMFY_NODES_FILE = join(import.meta.dir, 'User', 'Config', 'comfy-nodes.json');

// ComfyUI Custom Nodes available for installation
const COMFY_NODES = [
    { name: 'ComfyUI-Manager', repo: 'https://github.com/ltdrdata/ComfyUI-Manager.git', desc: 'Essential node manager for ComfyUI', required: true },
    { name: 'comfyui-tooling-nodes', repo: 'https://github.com/Acly/comfyui-tooling-nodes.git', desc: 'Bridge nodes for external editor workflows', required: true },
    { name: 'comfyui-inpaint-nodes', repo: 'https://github.com/Acly/comfyui-inpaint-nodes.git', desc: 'Inpainting and generative fill nodes', required: true },
    { name: 'comfyui_controlnet_aux', repo: 'https://github.com/Fannovel16/comfyui_controlnet_aux.git', desc: 'ControlNet preprocessing and live control workflows', required: true },
    { name: 'ComfyUI-Inpaint-CropAndStitch', repo: 'https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git', desc: 'Crop and stitch nodes for inpainting workflows' },
    { name: 'ComfyUI_JPS-Nodes', repo: 'https://github.com/JPS-GER/ComfyUI_JPS-Nodes.git', desc: 'Image processing and utility nodes' },
    { name: 'ComfyUI_ComfyRoll_CustomNodes', repo: 'https://github.com/Suzie1/ComfyUI_ComfyRoll_CustomNodes.git', desc: 'Animation and batch processing nodes' },
    { name: 'ComfyUI-Inspire-Pack', repo: 'https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git', desc: 'Advanced prompt and regional control' },
    { name: 'ComfyUI-Impact-Pack', repo: 'https://github.com/ltdrdata/ComfyUI-Impact-Pack.git', desc: 'Detailer, face detection, and more' },
    { name: 'ComfyUI-Impact-Subpack', repo: 'https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git', desc: 'Additional Impact Pack features' },
    { name: 'ComfyUI_UltimateSDUpscale', repo: 'https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git', desc: 'Ultimate SD Upscale nodes for tiled upscaling workflows', required: true },
    { name: 'Nvidia_RTX_Nodes_ComfyUI', repo: 'https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI.git', desc: 'Official NVIDIA RTX video super resolution nodes', nvidiaOnly: true },
    { name: 'was-node-suite-comfyui', repo: 'https://github.com/WASasquatch/was-node-suite-comfyui.git', desc: 'Extensive utility node collection' },
    { name: 'ComfyUI-Custom-Scripts', repo: 'https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git', desc: 'UI enhancements and workflow tools' }
];

interface ComfyNodesConfig {
    enabledNodes: string[];
}

function loadComfyNodesConfig(): ComfyNodesConfig {
    try {
        if (existsSync(COMFY_NODES_FILE)) {
            return JSON.parse(readFileSync(COMFY_NODES_FILE, 'utf-8'));
        }
    } catch { }
    // Default: all nodes enabled
    return { enabledNodes: COMFY_NODES.map(n => n.name) };
}

function saveComfyNodesConfig(config: ComfyNodesConfig) {
    writeFileSync(COMFY_NODES_FILE, JSON.stringify(config, null, 2));
}

const ROOT_DIR = process.env.UMBRA_ROOT || import.meta.dir;
const TOOLS_DIR = join(ROOT_DIR, 'Tools');
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

function configureGitRepoForPortableUpdates(dir: string): void {
    if (!existsSync(join(dir, '.git'))) return;
    try {
        execSync('git config --local core.fsmonitor false', { cwd: dir, stdio: 'ignore' });
        execSync('git config --local core.untrackedCache false', { cwd: dir, stdio: 'ignore' });
    } catch { }
}

// GPU Info cache
let cachedGPUInfo: { name: string; vramMB: number } | null = null;

function getGPUInfo(): { name: string; vramMB: number } | null {
    if (cachedGPUInfo) return cachedGPUInfo;

    try {
        const result = spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf-8' });
        if (result.status === 0 && result.stdout.trim()) {
            const parts = result.stdout.trim().split(',').map(s => s.trim());
            cachedGPUInfo = {
                name: parts[0] || 'NVIDIA GPU',
                vramMB: parseInt(parts[1]) || 0
            };
            return cachedGPUInfo;
        }
    } catch { }
    return null;
}

function isLowVRAM(): boolean {
    const gpu = getGPUInfo();
    return gpu !== null && gpu.vramMB <= 8192; // 8GB or less
}

// Colors
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    dim: '\x1b[2m'
};

// Tool configurations (matching setup-tools.ts)
type ToolConfig = {
    name: string;
    search: string[];
    repo?: string;
};

const TOOLS: Record<string, ToolConfig> = {
    comfyui: { name: 'ComfyUI', search: ['comfyui', 'comfy'], repo: 'https://github.com/comfyanonymous/ComfyUI.git' },
    aitoolkit: { name: 'AI-Toolkit', search: ['ai-toolkit', 'aitoolkit'], repo: 'https://github.com/ostris/ai-toolkit.git' }
};

// Helper functions
function log(icon: string, message: string) {
    console.log(`  ${icon} ${message}`);
}

function findToolPath(searchPatterns: string[]): string | null {
    if (!existsSync(TOOLS_DIR)) return null;
    try {
        const entries = readdirSync(TOOLS_DIR);
        for (const pattern of searchPatterns) {
            const match = entries.find((e) =>
                e.toLowerCase().includes(pattern.toLowerCase()) &&
                statSync(join(TOOLS_DIR, e)).isDirectory()
            );
            if (match) return join(TOOLS_DIR, match);
        }
    } catch { }
    return null;
}

function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function getToolStatus(toolId: keyof typeof TOOLS) {
    const tool = TOOLS[toolId];
    const toolPath = findToolPath(tool.search);

    if (!toolPath) return { installed: false, version: null };

    // Check for version info
    let version = 'installed';
    if (existsSync(join(toolPath, '.git'))) {
        try {
            const hash = execSync('git rev-parse --short HEAD', {
                cwd: toolPath,
                encoding: 'utf-8'
            }).trim();
            version = hash;
        } catch { }
    }

    return { installed: true, version, path: toolPath };
}

async function checkForUpdates(toolId: keyof typeof TOOLS): Promise<string | null> {
    const tool = TOOLS[toolId];
    const toolPath = findToolPath(tool.search);
    
    if (!toolPath) return null;

    if (!existsSync(join(toolPath, '.git'))) return null;

    try {
        configureGitRepoForPortableUpdates(toolPath);
        execSync('git fetch', { cwd: toolPath, stdio: 'ignore' });
        const status = execSync('git status -uno', { cwd: toolPath, encoding: 'utf-8' });
        return status.includes('behind') ? 'update available' : 'up to date';
    } catch {
        return 'error checking';
    }
}

// Main menu
async function showMenu() {
    console.clear();
    console.log(`\n${c.cyan}╔════════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.cyan}║${c.reset}  ${c.bold}Umbra Studio - Tool Manager${c.reset}                  ${c.cyan}║${c.reset}`);
    console.log(`${c.cyan}╚════════════════════════════════════════════════╝${c.reset}\n`);

    console.log(`${c.bold}Installed Tools:${c.reset}`);
    for (const [id, tool] of Object.entries(TOOLS)) {
        const status = getToolStatus(id as keyof typeof TOOLS);
        const icon = status.installed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
        const version = status.version ? `${c.dim}(${status.version})${c.reset}` : '';
        console.log(`  ${icon} ${tool.name} ${version}`);
    }

    // Show VRAM warning for 8GB or less GPUs
    const gpu = getGPUInfo();
    if (gpu && isLowVRAM()) {
        const vramGB = (gpu.vramMB / 1024).toFixed(1);
        console.log(`
${c.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}
  ${c.yellow}⚠ Low VRAM Detected: ${gpu.name} (${vramGB}GB)${c.reset}

  For SDXL or models over 7GB, you may need to adjust
  settings in ComfyUI for best performance.

  ${c.bold}Config Files:${c.reset}
  ${c.cyan}ComfyUI:${c.reset} Keep native defaults for launch behavior
${c.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    }

    console.log(`\n${c.bold}Options:${c.reset}`);
    console.log(`  ${c.cyan}[1]${c.reset} Install a tool`);
    console.log(`  ${c.cyan}[2]${c.reset} Uninstall a tool`);
    console.log(`  ${c.cyan}[3]${c.reset} Check for updates`);
    console.log(`  ${c.cyan}[4]${c.reset} Update tools (git pull)`);
    console.log(`  ${c.cyan}[5]${c.reset} Update PyTorch (latest CUDA)`);
    console.log(`  ${c.cyan}[6]${c.reset} Manage Custom Nodes ${c.dim}(ComfyUI)${c.reset}`);
    if (IS_LINUX) {
        console.log(`  ${c.cyan}[7]${c.reset} Launch Umbra Studio ${c.dim}(Webapp)${c.reset}`);
        console.log(`  ${c.cyan}[8]${c.reset} Update CUDA toolkit ${c.dim}(requires sudo)${c.reset}`);
        console.log(`  ${c.cyan}[0]${c.reset} Exit\n`);
    } else {
        console.log(`  ${c.cyan}[7]${c.reset} Launch Umbra Studio ${c.dim}(Webapp)${c.reset}`);
        console.log(`  ${c.cyan}[0]${c.reset} Exit\n`);
    }
}

async function installTool() {
    console.log(`\n${c.bold}Available tools to install:${c.reset}`);

    const uninstalled = Object.entries(TOOLS).filter(([id]) =>
        !getToolStatus(id as keyof typeof TOOLS).installed
    );

    if (uninstalled.length === 0) {
        log(`${c.green}✓${c.reset}`, 'All tools are already installed');
        await prompt('\nPress Enter to continue...');
        return;
    }

    uninstalled.forEach(([, tool], i) => {
        console.log(`  ${c.cyan}[${i + 1}]${c.reset} ${tool.name}`);
    });
    console.log(`  ${c.cyan}[0]${c.reset} Cancel\n`);

    const choice = await prompt('Install which tool? ');
    const idx = parseInt(choice) - 1;

    if (idx < 0 || idx >= uninstalled.length) return;

    const [toolId] = uninstalled[idx];
    log('→', `Installing ${TOOLS[toolId as keyof typeof TOOLS].name}...`);
    log('→', 'Running setup script...');

    try {
        execSync(`bun setup-tools.ts ${toolId}`, {
            cwd: ROOT_DIR,
            stdio: 'inherit'
        });
        log(`${c.green}✓${c.reset}`, 'Installation complete');
    } catch {
        log(`${c.red}✗${c.reset}`, 'Installation failed');
    }

    await prompt('\nPress Enter to continue...');
}

async function uninstallTool() {
    console.log(`\n${c.bold}Installed tools:${c.reset}`);

    const installed = Object.entries(TOOLS).filter(([id]) =>
        getToolStatus(id as keyof typeof TOOLS).installed
    );

    if (installed.length === 0) {
        log(`${c.yellow}⚠${c.reset}`, 'No tools are installed');
        await prompt('\nPress Enter to continue...');
        return;
    }

    installed.forEach(([, tool], i) => {
        console.log(`  ${c.cyan}[${i + 1}]${c.reset} ${tool.name}`);
    });
    console.log(`  ${c.cyan}[0]${c.reset} Cancel\n`);

    const choice = await prompt('Uninstall which tool? ');
    const idx = parseInt(choice) - 1;

    if (idx < 0 || idx >= installed.length) return;

    const [toolId, tool] = installed[idx];
    const confirm = await prompt(`${c.yellow}Delete ${tool.name}? [y/N]:${c.reset} `);

    if (!confirm.toLowerCase().startsWith('y')) {
        log('→', 'Cancelled');
        await prompt('\nPress Enter to continue...');
        return;
    }

    const toolPath = getToolStatus(toolId as keyof typeof TOOLS).path!;
    log('→', `Removing ${tool.name}...`);

    try {
        if (IS_WINDOWS) {
            execSync(`rmdir /s /q "${toolPath}"`, { stdio: 'inherit' });
        } else {
            execSync(`rm -rf "${toolPath}"`, { stdio: 'inherit' });
        }
        log(`${c.green}✓${c.reset}`, `${tool.name} uninstalled`);
    } catch {
        log(`${c.red}✗${c.reset}`, 'Uninstall failed');
    }

    await prompt('\nPress Enter to continue...');
}

async function checkUpdates() {
    console.log(`\n${c.bold}Checking for updates...${c.reset}\n`);

    const updates: { id: string; tool: any; status: string }[] = [];

    for (const [id, tool] of Object.entries(TOOLS)) {
        if (!getToolStatus(id as keyof typeof TOOLS).installed) continue;

        const status = await checkForUpdates(id as keyof typeof TOOLS);
        if (status) {
            updates.push({ id, tool, status });
            const icon = status.includes('available') ? `${c.yellow}↑${c.reset}` : `${c.green}✓${c.reset}`;
            console.log(`  ${icon} ${tool.name}: ${status}`);
        }
    }

    if (updates.length === 0) {
        log(`${c.green}✓${c.reset}`, 'All tools are up to date');
    }

    await prompt('\nPress Enter to continue...');
}

async function updateTools() {
    console.log(`\n${c.bold}Updating tools...${c.reset}\n`);

    const needsUpdate: { id: string; tool: any }[] = [];

    for (const [id, tool] of Object.entries(TOOLS)) {
        if (!getToolStatus(id as keyof typeof TOOLS).installed) continue;

        const status = await checkForUpdates(id as keyof typeof TOOLS);
        if (status && status.includes('available')) {
            needsUpdate.push({ id, tool });
        }
    }

    if (needsUpdate.length === 0) {
        log(`${c.green}✓${c.reset}`, 'All tools are up to date');
        await prompt('\nPress Enter to continue...');
        return;
    }

    console.log(`Found ${needsUpdate.length} tool(s) with updates available.\n`);
    const confirm = await prompt('Update all? [y/N]: ');

    if (!confirm.toLowerCase().startsWith('y')) {
        log('→', 'Cancelled');
        await prompt('\nPress Enter to continue...');
        return;
    }

    for (const { id, tool } of needsUpdate) {
        log('→', `Updating ${tool.name}...`);
        const toolPath = getToolStatus(id as keyof typeof TOOLS).path!;
        
        try {
            try {
                execSync(`git config --global --add safe.directory "${toolPath.replace(/"/g, '\\"')}"`, { cwd: toolPath, stdio: 'ignore' });
            } catch {}
            configureGitRepoForPortableUpdates(toolPath);
            try {
                execSync('git pull --rebase --autostash', { cwd: toolPath, stdio: 'inherit' });
            } catch {
                execSync('git fetch --all --prune', { cwd: toolPath, stdio: 'inherit' });
                execSync('git pull --ff-only', { cwd: toolPath, stdio: 'inherit' });
            }
            if (tool.repo?.includes('ai-toolkit')) {
                execSync('git submodule update --init --recursive', {
                    cwd: toolPath,
                    stdio: 'inherit'
                });
            }
            log(`${c.green}✓${c.reset}`, `${tool.name} updated`);
        } catch {
            log(`${c.red}✗${c.reset}`, `Failed to update ${tool.name}`);
        }
    }
    log(`${c.green}✓${c.reset}`, 'Tool updates complete');
    await prompt('\nPress Enter to continue...');
}

async function getLatestCUDAVersion(): Promise<string> {
    // Fetch latest CUDA version from PyTorch website
    try {
        const response = await fetch('https://pytorch.org/');
        const html = await response.text();

        // Look for CUDA version in the page (usually cu118, cu121, cu124, etc.)
        const cudaMatch = html.match(/cu(\d{3})/g);
        if (cudaMatch && cudaMatch.length > 0) {
            // Get the highest version
            const versions = cudaMatch.map(v => parseInt(v.substring(2)));
            const latest = Math.max(...versions);
            return `cu${latest}`;
        }
    } catch {
        log(`${c.yellow}⚠${c.reset}`, 'Could not fetch latest CUDA version, using cu121');
    }
    return 'cu121'; // Default fallback
}

async function updatePyTorch() {
    console.log(`\n${c.cyan}⚡ PyTorch Update${c.reset}\n`);
    console.log('This will update PyTorch to the latest version with CUDA support.');

    const confirm = await prompt('\nContinue? [y/N]: ');
    if (!confirm.toLowerCase().startsWith('y')) {
        log('→', 'Cancelled');
        await prompt('\nPress Enter to continue...');
        return;
    }

    log('→', 'Detecting latest CUDA version...');
    const cudaVersion = await getLatestCUDAVersion();
    log('✓', `Using CUDA version: ${cudaVersion}`);

    // Update PyTorch in each tool
    for (const [id, tool] of Object.entries(TOOLS)) {
        const status = getToolStatus(id as keyof typeof TOOLS);
        if (!status.installed) continue;

        log('→', `Updating PyTorch for ${tool.name}...`);
        const toolPath = status.path!;

        const venvPython = IS_WINDOWS
            ? join(toolPath, 'venv', 'Scripts', 'python.exe')
            : join(toolPath, 'venv', 'bin', 'python');

        if (existsSync(venvPython)) {
            try {
                const indexUrl = `https://download.pytorch.org/whl/${cudaVersion}`;
                execSync(`"${venvPython}" -m pip install --upgrade torch torchvision torchaudio --index-url ${indexUrl}`, {
                    stdio: 'inherit',
                    shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash'
                });

                // Remove marker to force recheck
                const marker = join(toolPath, '.torch_installed');
                if (existsSync(marker)) {
                    if (IS_WINDOWS) {
                        execSync(`del "${marker}"`, { shell: 'cmd.exe' });
                    } else {
                        execSync(`rm "${marker}"`);
                    }
                }

                log(`${c.green}✓${c.reset}`, `${tool.name} PyTorch updated`);
            } catch {
                log(`${c.red}✗${c.reset}`, `Failed to update ${tool.name}`);
            }
        }
    }

    log(`${c.green}✓${c.reset}`, 'PyTorch update complete');
    await prompt('\nPress Enter to continue...');
}

async function updateCUDA() {
    if (!IS_LINUX) {
        log(`${c.yellow}⚠${c.reset}`, 'CUDA toolkit update is only available on Linux');
        log('→', 'On Windows, use NVIDIA GeForce Experience or download from nvidia.com');
        await prompt('\nPress Enter to continue...');
        return;
    }

    console.log(`\n${c.yellow}⚡ CUDA Toolkit Update${c.reset}\n`);
    console.log('This will update the CUDA toolkit and NVIDIA drivers.');
    console.log(`${c.yellow}⚠ Requires sudo privileges${c.reset}\n`);

    const confirm = await prompt('Continue? [y/N]: ');
    if (!confirm.toLowerCase().startsWith('y')) {
        log('→', 'Cancelled');
        await prompt('\nPress Enter to continue...');
        return;
    }

    // Check for sudo
    try {
        // Try to refresh sudo credentials (prompts for password if needed)
        execSync('sudo -v', { stdio: 'inherit' });
    } catch {
        log(`${c.red}✗${c.reset}`, 'Sudo authentication failed');
        await prompt('\nPress Enter to continue...');
        return;
    }

    log('→', 'Updating package lists...');
    try {
        if (existsSync('/usr/bin/pacman')) {
            // Arch / CachyOS
            execSync('sudo pacman -Sy', { stdio: 'inherit' });
        } else if (existsSync('/usr/bin/dnf')) {
            // Fedora
            execSync('sudo dnf check-update', { stdio: 'inherit' });
        } else if (existsSync('/usr/bin/apt')) {
            // Debian / Ubuntu
            execSync('sudo apt update', { stdio: 'inherit' });
        } else {
            throw new Error('Unsupported package manager');
        }
    } catch {
        log(`${c.red}✗${c.reset}`, 'Failed to update package lists');
        await prompt('\nPress Enter to continue...');
        return;
    }

    log('→', 'Upgrading CUDA toolkit and NVIDIA drivers...');
    log('→', 'This may take several minutes...');
    try {
        if (existsSync('/usr/bin/pacman')) {
            // Arch / CachyOS
            // CachyOS often has optimized packages, but standard arch commands usually work or map correctly
            execSync('sudo pacman -S --needed cuda nvidia-utils', { stdio: 'inherit' });
        } else if (existsSync('/usr/bin/dnf')) {
            // Fedora
            execSync('sudo dnf install xorg-x11-drv-nvidia-cuda', { stdio: 'inherit' });
        } else if (existsSync('/usr/bin/apt')) {
            // Debian / Ubuntu
            execSync('sudo apt upgrade -y cuda-toolkit cuda-drivers', { stdio: 'inherit' });
        }
        
        log(`${c.green}✓${c.reset}`, 'CUDA toolkit updated successfully');
        log(`${c.yellow}⚠${c.reset}`, 'You may need to reboot for changes to take effect');
    } catch {
        log(`${c.yellow}⚠${c.reset}`, 'CUDA update failed or packages not found');
        log('→', 'Please check your distribution documentation for NVIDIA driver installation');
    }

    await prompt('\nPress Enter to continue...');
}

async function manageCustomNodes() {
    console.log(`\n${c.cyan}⚙ ComfyUI Custom Nodes${c.reset}\n`);
    console.log(`Select which custom nodes to install with ComfyUI.\n`);

    const config = loadComfyNodesConfig();
    const enabledNodes = new Set(config.enabledNodes);

    // Show node options
    COMFY_NODES.forEach((node, i) => {
        const enabled = enabledNodes.has(node.name);
        const icon = enabled ? `${c.green}✓${c.reset}` : ` `;
        const required = 'required' in node && node.required ? `${c.yellow}(required)${c.reset}` : '';
        console.log(`  ${c.cyan}[${i + 1}]${c.reset} ${icon} ${node.name} ${required}`);
        console.log(`      ${c.dim}${node.desc}${c.reset}`);
    });

    console.log(`\n  ${c.cyan}[A]${c.reset} Enable all nodes`);
    console.log(`  ${c.cyan}[N]${c.reset} Disable all (except required)`);
    console.log(`  ${c.cyan}[I]${c.reset} Install selected nodes now`);
    console.log(`  ${c.cyan}[0]${c.reset} Back to main menu\n`);

    const choice = await prompt(`Toggle node (1-${COMFY_NODES.length}) or action: `);

    if (choice === '0' || choice === '') {
        return;
    }

    if (choice.toLowerCase() === 'a') {
        // Enable all
        config.enabledNodes = COMFY_NODES.map(n => n.name);
        saveComfyNodesConfig(config);
        log(`${c.green}✓${c.reset}`, 'All nodes enabled');
        await new Promise(resolve => setTimeout(resolve, 500));
        return manageCustomNodes();
    }

    if (choice.toLowerCase() === 'n') {
        // Disable all except required
        config.enabledNodes = COMFY_NODES.filter(n => 'required' in n && n.required).map(n => n.name);
        saveComfyNodesConfig(config);
        log(`${c.green}✓${c.reset}`, 'All optional nodes disabled');
        await new Promise(resolve => setTimeout(resolve, 500));
        return manageCustomNodes();
    }

    if (choice.toLowerCase() === 'i') {
        // Install selected nodes now
        const comfyStatus = getToolStatus('comfyui');
        if (!comfyStatus.installed) {
            log(`${c.yellow}⚠${c.reset}`, 'ComfyUI is not installed. Install it first from the main menu.');
            await prompt('\nPress Enter to continue...');
            return manageCustomNodes();
        }

        const comfyPath = comfyStatus.path!;
        const nodesDir = join(comfyPath, 'custom_nodes');

        if (!existsSync(nodesDir)) {
            mkdirSync(nodesDir, { recursive: true });
        }

        console.log(`\n${c.cyan}Installing selected custom nodes...${c.reset}\n`);

        for (const node of COMFY_NODES) {
            if ('nvidiaOnly' in node && node.nvidiaOnly && !getGPUInfo()) {
                log('âˆ’', `${node.name} ${c.dim}(skipped - NVIDIA GPU not detected)${c.reset}`);
                continue;
            }
            if (!enabledNodes.has(node.name)) {
                log('−', `${node.name} ${c.dim}(skipped - not selected)${c.reset}`);
                continue;
            }

            const nodePath = join(nodesDir, node.name);
            if (existsSync(nodePath)) {
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
                } catch {
                    log('✓', `${node.name} already installed`);
                }
            } else {
                log('→', `Installing ${node.name}...`);
                try {
                    execSync(`git clone ${node.repo} ${node.name}`, { cwd: nodesDir, stdio: 'ignore' });
                    configureGitRepoForPortableUpdates(nodePath);

                    // Install requirements if present
                    const reqFile = join(nodePath, 'requirements.txt');
                    if (existsSync(reqFile)) {
                        const venvPython = IS_WINDOWS
                            ? join(comfyPath, 'venv', 'Scripts', 'python.exe')
                            : join(comfyPath, 'venv', 'bin', 'python');

                        if (existsSync(venvPython)) {
                            log('→', `Installing requirements for ${node.name}...`);
                            try {
                                execSync(`"${venvPython}" -m pip install -r "${reqFile}"`, {
                                    stdio: 'ignore',
                                    shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash'
                                });
                            } catch {
                                log(`${c.yellow}⚠${c.reset}`, `Failed to install requirements for ${node.name}`);
                            }
                        }
                    }
                    log(`${c.green}✓${c.reset}`, `${node.name} installed`);
                } catch {
                    log(`${c.red}✗${c.reset}`, `Failed to install ${node.name}`);
                }
            }
        }

        log(`${c.green}✓${c.reset}`, 'Custom node installation complete');
        await prompt('\nPress Enter to continue...');
        return manageCustomNodes();
    }

    // Toggle a specific node
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < COMFY_NODES.length) {
        const node = COMFY_NODES[idx];

        // Check if required
        if ('required' in node && node.required) {
            log(`${c.yellow}⚠${c.reset}`, `${node.name} is required and cannot be disabled`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return manageCustomNodes();
        }

        // Toggle
        if (enabledNodes.has(node.name)) {
            enabledNodes.delete(node.name);
            log(`${c.yellow}−${c.reset}`, `Disabled ${node.name}`);
        } else {
            enabledNodes.add(node.name);
            log(`${c.green}+${c.reset}`, `Enabled ${node.name}`);
        }

        config.enabledNodes = Array.from(enabledNodes);
        saveComfyNodesConfig(config);

        await new Promise(resolve => setTimeout(resolve, 500));
        return manageCustomNodes();
    }

    log(`${c.yellow}⚠${c.reset}`, 'Invalid choice');
    await new Promise(resolve => setTimeout(resolve, 1000));
    return manageCustomNodes();
}

async function launchUmbraStudioWebapp() {
    console.log(`\n${c.cyan}→ Launching Umbra Studio webapp...${c.reset}\n`);
    try {
        if (IS_WINDOWS) {
            execSync('start "Umbra Studio" bun run webapp:dev', { cwd: ROOT_DIR, shell: 'cmd.exe' });
            process.exit(0);
        } else {
            execSync('bun run webapp:dev', { cwd: ROOT_DIR, stdio: 'inherit', shell: '/bin/bash' });
        }
    } catch (error) {
        log(`${c.red}✗${c.reset}`, 'Failed to launch Umbra Studio webapp');
        log('→', 'Install dependencies if needed: bun install');
        await prompt('\nPress Enter to continue...');
    }
}

// Main loop
async function main() {
    while (true) {
        await showMenu();

        const choice = await prompt(`${c.bold}Choice:${c.reset} `);

        switch (choice) {
            case '1':
                await installTool();
                break;
            case '2':
                await uninstallTool();
                break;
            case '3':
                await checkUpdates();
                break;
            case '4':
                await updateTools();
                break;
            case '5':
                await updatePyTorch();
                break;
            case '6':
                await manageCustomNodes();
                break;
            case '7':
                if (IS_LINUX) {
                    await launchUmbraStudioWebapp();
                } else {
                    await launchUmbraStudioWebapp();
                }
                break;
            case '8':
                if (IS_LINUX) {
                    await updateCUDA();
                }
                break;
            case '0':
                console.log(`\n${c.cyan}Goodbye!${c.reset}\n`);
                process.exit(0);
            default:
                log(`${c.yellow}⚠${c.reset}`, 'Invalid choice');
                await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

main().catch(console.error);
