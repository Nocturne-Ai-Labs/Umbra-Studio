"""Validate portable release structure and privacy before publishing either archive."""
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile


def validate(archive, version, platform):
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError(f'{archive.name}: duplicate archive entries')
        for entry in entries:
            parts = PurePosixPath(entry.filename).parts
            if not parts or parts[0] != 'Umbra Studio' or '..' in parts or '\\' in entry.filename:
                raise ValueError(f'{archive.name}: unsafe archive layout')
            if entry.is_dir():
                continue
            relative = '/'.join(parts[1:])
            leaf = parts[-1]
            if any(part in {'.git', '.agents', '.codex', '.tmp'} for part in parts):
                raise ValueError(f'{archive.name}: private directory: {relative}')
            if leaf == '.env' or leaf.startswith('.env.') or leaf.endswith(('.db', '.sqlite', '.sqlite3', '.safetensors', '.ckpt')):
                raise ValueError(f'{archive.name}: private runtime file: {relative}')
            if ('/Wildcards/' in relative or relative.startswith('User/Logs/')) and leaf != '.gitkeep':
                raise ValueError(f'{archive.name}: private library or log: {relative}')
            if '/node_modules/' not in relative and ('.test.' in leaf or leaf.startswith('qualify-anima-') or leaf == 'test_anima_model_merge.py'):
                raise ValueError(f'{archive.name}: internal test source: {relative}')
        required = [
            'resources/app/package.json', 'resources/app/UmbraServer.js',
            'resources/app/setup/UmbraSetupApp.js',
            'resources/app/backend/python/anima_model_merge.py',
            'resources/app/backend/python/model_merge_layout.py',
            'resources/app/node_modules/yazl/package.json',
            'resources/app/node_modules/sharp/package.json',
            'resources/app/defaults/UmbraUI/model-manifest.json',
            'resources/app/defaults/DataForge/model-manifest.json',
        ]
        required += (['UmbraStudio.bat', 'UmbraSetup.bat', 'Runtime/Bun/win32/bun.exe']
                     if platform == 'Windows-x64-BAT' else
                     ['umbra-setup.sh', 'Runtime/Bun/linux/bun'])
        for name in required:
            if f'Umbra Studio/{name}' not in names:
                raise ValueError(f'{archive.name}: missing {name}')
        if 'Umbra Studio/UmbraStudio.exe' in names:
            raise ValueError('Unexpected EXE launcher in portable package')
        manifest = json.loads(package.read('Umbra Studio/resources/app/package.json'))
        if manifest['version'] != version:
            raise ValueError(f'{archive.name}: version mismatch')
        if package.testzip() is not None:
            raise ValueError(f'{archive.name}: corrupt archive member')
        print(f'PASS {archive.name}: {len(entries)} entries, version {version}, CRC and privacy checks')


if __name__ == '__main__':
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts')
    version = json.loads(Path('package.json').read_text(encoding='utf-8'))['version']
    for platform in ['Windows-x64-BAT', 'Linux-x64']:
        validate(root / f'Umbra-Studio-v{version}-{platform}.zip', version, platform)
