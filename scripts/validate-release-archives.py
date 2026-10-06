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
            if leaf.endswith(('.onnx', '.pt', '.safetensors', '.ckpt')):
                raise ValueError(f'{archive.name}: model weights are excluded: {relative}')
            if any(part.casefold() in {'.git', '.agents', '.codex', '.tmp'} for part in parts):
                raise ValueError(f'{archive.name}: private directory: {relative}')
            if (leaf == '.env' or leaf.startswith('.env.') or leaf == 'skills.md'
                    or re.search(r'\.(?:db|sqlite3?)(?:-(?:wal|shm|journal))?$', leaf)):
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
            'resources/app/scripts/install-pixai-tagger-deps.mjs',
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
            'resources/app/defaults/UmbraUI/tool-requirements.json',
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
        policy_path = Path(__file__).resolve().parent.parent / 'defaults/MediaTools/manifest.json'
        policy = json.loads(policy_path.read_text(encoding='utf-8'))
        packaged_policy = json.loads(package.read('Umbra Studio/resources/app/defaults/MediaTools/manifest.json'))
        if packaged_policy != policy:
            raise ValueError(f'{archive.name}: media policy differs from release source')
        media_platform = 'win32' if platform == 'Windows-x64-BAT' else 'linux'
        media_root = f'Umbra Studio/Runtime/FFmpeg/{media_platform}/'
        installed = json.loads(package.read(media_root + 'installed.json'))
        pin = policy['packages'][media_platform]
        if (installed.get('version') != policy['version'] or installed.get('release') != policy['release']
                or installed.get('license') != policy['license'] or installed.get('binDirectory') != 'bin'
                or installed.get('archiveSha256') != pin['sha256'] or installed.get('archiveBytes') != pin['bytes']):
            raise ValueError(f'{archive.name}: invalid bundled FFmpeg provenance')
        suffix = '.exe' if media_platform == 'win32' else ''
        for name in [f'bin/ffmpeg{suffix}', f'bin/ffprobe{suffix}', 'LICENSE.txt']:
            expected = installed.get('files', {}).get(name, {})
            member = package.getinfo(media_root + name)
            if member.file_size != expected.get('bytes') or digest(member.filename).hex() != expected.get('sha256'):
                raise ValueError(f'{archive.name}: bundled media checksum mismatch: {name}')
            if media_platform == 'linux' and name.startswith('bin/') and not (member.external_attr >> 16) & 0o111:
                raise ValueError(f'{archive.name}: media executable permission missing: {name}')
        for name in ['SOURCE.json', 'BUILD-CONFIG.txt']:
            if media_root + name not in names:
                raise ValueError(f'{archive.name}: missing media notice: {name}')
        helper_policy = json.loads((policy_path.parent.parent / 'PythonHelpers/manifest.json').read_text(encoding='utf-8'))
        if json.loads(package.read('Umbra Studio/resources/app/defaults/PythonHelpers/manifest.json')) != helper_policy:
            raise ValueError(f'{archive.name}: Python helper policy differs from release source')
        helper_root = f'Umbra Studio/Runtime/PythonHelpers/bundled/{media_platform}/'
        helpers = json.loads(package.read(helper_root + 'installed.json'))
        policy_hash = hashlib.sha256(json.dumps(helper_policy, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
        if (helpers.get('schemaVersion') != 1 or helpers.get('policySha256') != policy_hash
                or helpers.get('pythonVersion') != helper_policy['pythonVersion']
                or helpers.get('pythonArchiveSha256') != helper_policy['platforms'][media_platform]['python']['sha256']
                or helper_policy.get('modelsIncluded') is not False):
            raise ValueError(f'{archive.name}: invalid bundled Python provenance')
        helper_files = helpers.get('files', {})
        if not helper_files or len(helper_files) > 50000:
            raise ValueError(f'{archive.name}: invalid Python file inventory')
        # The inventory must cover actual ZIP files, including cached bundle extras.
        actual_helper_files = {
            entry.filename[len(helper_root):] for entry in entries if not entry.is_dir()
            and (entry.filename.casefold().startswith(helper_root.casefold())
                 if media_platform == 'win32' else entry.filename.startswith(helper_root))
        }
        if actual_helper_files != set(helper_files) | {'installed.json'} or 'installed.json' in helper_files:
            raise ValueError(f'{archive.name}: Python file inventory differs from actual archive files')
        for name, expected in helper_files.items():
            if (name.startswith('/') or '\\' in name or ':' in name
                    or any(part in {'', '.', '..'} for part in name.split('/'))
                    or name.startswith('models/') or re.search(r'\.(?:onnx|safetensors|ckpt|pt)$', name, re.I)):
                raise ValueError(f'{archive.name}: unsafe Python dependency file: {name}')
            member = package.getinfo(helper_root + name)
            if member.file_size != expected.get('bytes') or digest(member.filename).hex() != expected.get('sha256'):
                raise ValueError(f'{archive.name}: Python dependency checksum mismatch: {name}')
        interpreter = 'python/python.exe' if media_platform == 'win32' else 'python/bin/python3.11'
        for name in [interpreter, 'PACKAGES.json']:
            if name not in helper_files:
                raise ValueError(f'{archive.name}: missing Python bundle file: {name}')
        if media_platform == 'linux' and not (package.getinfo(helper_root + interpreter).external_attr >> 16) & 0o111:
            raise ValueError(f'{archive.name}: bundled Python executable permission missing')
        if package.testzip() is not None:
            raise ValueError(f'{archive.name}: corrupt archive member')
        print(f'PASS {archive.name}: {len(entries)} entries, version {version}, CRC and privacy checks')


if __name__ == '__main__':
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'artifacts')
    version = json.loads(Path('package.json').read_text(encoding='utf-8'))['version']
    for platform in ['Windows-x64-BAT', 'Linux-x64']:
        validate(root / f'Umbra-Studio-v{version}-{platform}.zip', version, platform)
