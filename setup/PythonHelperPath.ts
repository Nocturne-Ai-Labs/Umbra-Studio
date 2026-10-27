import { spawnSync } from 'node:child_process';

// Exercise the real interpreter/filesystem rather than assuming a registry value
// proves that every Python distribution supports long Windows paths.
export function verifyPythonHelperInstallPath(python: string, helperRoot: string, platform = process.platform): { ok: boolean; detail: string } {
  if (platform !== 'win32') return { ok: true, detail: '' };
  const script = `import os,sys,tempfile\nwith tempfile.TemporaryDirectory(prefix='.path-check-',dir=sys.argv[1]) as root:\n p=os.path.join(root,'venv','Lib','site-packages','torch','include','ATen','native','transformers','cuda','mem_eff_attention','iterators','predicated_tile_access_iterator_residual_last.h')\n os.makedirs(os.path.dirname(p),exist_ok=True)\n with open(p,'w') as f: f.write('path check')\n`;
  const result = spawnSync(python, ['-I', '-B', '-c', script, helperRoot], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  return { ok: result.status === 0, detail: result.error?.message || result.stderr?.trim() || '' };
}
