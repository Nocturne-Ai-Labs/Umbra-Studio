"""Validate portable release structure and privacy before publishing either archive."""
import json
import hashlib
from pathlib import Path
import re
import stat
import sys
import zipfile


def validate(archive, version, platform):
    if platform not in {'Windows-x64-BAT', 'Linux-x64'}:
        raise ValueError(f'Unsupported release platform: {platform}')
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        names = [entry.filename for entry in entries]
        if len(names) != len(set(names)):
            raise ValueError(f'{archive.name}: duplicate archive entries')
        seen = set()
        files = set()
        digests = {}

        def digest(name):
            if name not in digests:
                value = hashlib.sha256()
                with package.open(name) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        value.update(chunk)
                digests[name] = value.digest()
            return digests[name]

        for entry in entries:
            path = entry.filename[:-1] if entry.is_dir() else entry.filename
            parts = path.split('/')
            if (not parts or parts[0] != 'Umbra Studio'
                    or (len(parts) == 1 and not entry.is_dir())
                    or any(part in {'', '.', '..'} for part in parts)
                    or re.search(r'[\\\x00-\x1f:]', path)):
                raise ValueError(f'{archive.name}: unsafe archive layout')
            if platform == 'Windows-x64-BAT' and any(
                    part.endswith((' ', '.')) or re.search(r'[<>"|?*]', part)
                    or re.match(r'^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', part, re.I)
                    for part in parts):
                raise ValueError(f'{archive.name}: unsafe Windows filename: {path}')
            key = path.casefold() if platform == 'Windows-x64-BAT' else path
            if key in seen:
                raise ValueError(f'{archive.name}: colliding archive entries: {path}')
            seen.add(key)
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if kind not in {0, stat.S_IFREG, stat.S_IFDIR}:
                raise ValueError(f'{archive.name}: unsupported file type: {path}')
            if (kind == stat.S_IFDIR and not entry.is_dir()) or (kind == stat.S_IFREG and entry.is_dir()):
                raise ValueError(f'{archive.name}: conflicting file type: {path}')
            if not entry.is_dir():
                files.add(key)
            relative = '/'.join(parts[1:])
            leaf = parts[-1].casefold()
            if any(part.casefold() in {'.git', '.agents', '.codex', '.tmp'} for part in parts):
                raise ValueError(f'{archive.name}: private directory: {relative}')
            if (leaf == '.env' or leaf.startswith('.env.') or leaf == 'skills.md'
                    or re.search(r'\.(?:db|sqlite3?)(?:-(?:wal|shm|journal))?$', leaf)
                    or leaf.endswith(('.safetensors', '.ckpt'))):
                raise ValueError(f'{archive.name}: private runtime file: {relative}')
            if entry.is_dir():
                continue
            if len(parts) > 3 and [part.casefold() for part in parts[1:3]] == ['resources', 'app'] and parts[3].casefold() in {'user', 'tools'}:
                raise ValueError(f'{archive.name}: nested runtime data: {relative}')
            if ('/wildcards/' in relative.casefold() or relative.casefold().startswith('user/logs/')) and leaf != '.gitkeep':
                raise ValueError(f'{archive.name}: private library or log: {relative}')
            if '/node_modules/' not in relative.casefold() and ('.test.' in leaf or re.match(r'test-.*\.[cm]?[jt]sx?$', leaf) or leaf.startswith('qualify-anima-') or leaf == 'test_anima_model_merge.py'):
                raise ValueError(f'{archive.name}: internal test source: {relative}')
            if parts[1].casefold() in {'user', 'tools'}:
                if leaf == '.gitkeep' and entry.file_size == 0:
                    continue
                default = 'Umbra Studio/resources/app/defaults/' + relative.removeprefix('User/')
                curated = any(relative.startswith('User/PowerPrompter/' + folder + '/')
                              for folder in ['API Workflows', 'CSV', 'Prompts'])
                if not curated or default not in names or digest(entry.filename) != digest(default):
                    raise ValueError(f'{archive.name}: unapproved runtime data: {relative}')
        for key in seen:
            if any('/'.join(key.split('/')[:index]) in files for index in range(1, len(key.split('/')))):
                raise ValueError(f'{archive.name}: file/directory path collision: {key}')
        required = [
            'resources/app/scripts/download-waifu-models.mjs',
            'resources/app/scripts/download-caption-models.mjs',
            'resources/app/scripts/download-umbra-ui-models.mjs',
            'resources/app/scripts/download-umbra-model-requirements.mjs',
            'resources/app/package.json', 'resources/app/UmbraServer.js',
            'resources/app/setup/UmbraSetupApp.js',
            'resources/app/backend/python/anima_model_merge.py',
            'resources/app/backend/python/model_merge_layout.py',
            'resources/app/setup/models.js',
            'resources/app/node_modules/yazl/package.json',
            'resources/app/node_modules/sharp/package.json',
            'resources/app/defaults/UmbraUI/model-manifest.json',
            'resources/app/defaults/UmbraUI/model-requirements-manifest.json',
            'resources/app/defaults/DataForge/model-manifest.json',
        ]
        required += (['UmbraStudio.bat', 'UmbraSetup.bat', 'Runtime/Bun/win32/bun.exe']
                     if platform == 'Windows-x64-BAT' else
                     ['umbra-setup.sh', 'start-umbra.sh', 'UmbraStudio.desktop', 'Runtime/Bun/linux/bun'])
        for name in required:
            if f'Umbra Studio/{name}' not in names:
                raise ValueError(f'{archive.name}: missing {name}')
        if 'Umbra Studio/UmbraStudio.exe' in names:
            raise ValueError('Unexpected EXE launcher in portable package')
        for retired in ['Install-Data-Forge-Models.bat', 'Install-Umbra-UI-Models.bat',
                        'Install-Umbra-UI-Support-Models.bat', 'Install-Model-Requirements.bat',
                        'install-data-forge-models.sh', 'install-umbra-ui-models.sh',
                        'install-umbra-ui-support-models.sh', 'install-model-requirements.sh']:
            if f'Umbra Studio/{retired}' in names:
                raise ValueError(f'Retired model shortcut is still packaged: {retired}')
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
