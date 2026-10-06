import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

// Use the same interpreter/config/parser as the install, without resolution or preparation.
// Private pip APIs changing is an actionable hold, never permission to compile StringZilla.
const WINDOWS_WHEEL_PREFLIGHT = String.raw`
import os, sys, urllib.parse, urllib.request
try:
    from pip._internal.commands import create_command
    from pip._internal.network.session import PipSession
    from pip._internal.req import req_file
    from pip._internal.req.constructors import install_req_from_parsed_requirement, install_req_from_editable
    from pip._vendor.packaging.utils import canonicalize_name, parse_sdist_filename
    command = create_command('install')
    options, _ = command.parse_args(['--prefer-binary', '--only-binary=stringzilla', '-r', sys.argv[1]])
    session = PipSession()
    def no_network(*args, **kwargs):
        raise ValueError('remote requirements cannot be inspected safely')
    session.get = no_network
    finder = command._build_package_finder(options, session)
    original_reader = req_file.get_file_content
    files, size, lines = 0, 0, 0
    def local_reader(location, session, **kwargs):
        global files, size
        parsed = urllib.parse.urlsplit(location)
        if location.startswith(('\\\\', '//')) or (parsed.scheme and not (len(parsed.scheme) == 1 and location[1:3] in (':\\', ':/'))):
            if parsed.scheme != 'file' or parsed.netloc:
                raise ValueError('only local requirements are inspectable')
            location = urllib.request.url2pathname(parsed.path)
        if location.replace('\\', '/').startswith('//'):
            raise ValueError('only local requirements are inspectable')
        files += 1
        if files > 64 or os.path.getsize(location) > 1048576:
            raise ValueError('requirements inspection limit')
        result = original_reader(location, session, **kwargs)
        size += len(result[1])
        if size > 1048576:
            raise ValueError('requirements inspection limit')
        return result
    req_file.get_file_content = local_reader
    parse_line = req_file.get_line_parser(finder)
    def guarded_line(line):
        global lines
        lines += 1
        if lines > 10000:
            raise ValueError('requirements inspection limit')
        result = parse_line(line)
        if finder.format_control.get_allowed_formats('stringzilla') != frozenset({'binary'}):
            raise ValueError('requirements override StringZilla wheel policy')
        return result
    parser = req_file.RequirementsFileParser(session, guarded_line)
    # Impact Pack uses this unnamed official VCS requirement. Its upstream setup.py
    # declares SAM-2; recognize only that exact source, without resolving metadata.
    known_sources = {'git+https://github.com/facebookresearch/sam2': 'sam-2'}
    def inspect_reference(requirement):
        if not requirement.link or requirement.link.is_wheel:
            return
        name = canonicalize_name(requirement.name) if requirement.name else known_sources.get(requirement.link.url)
        try:
            archive_name, _ = parse_sdist_filename(urllib.parse.unquote(requirement.link.filename))
        except ValueError:
            archive_name = None
        if name == 'stringzilla' or archive_name == 'stringzilla' or not (name or archive_name):
            raise ValueError('StringZilla or unnamed source reference cannot be allowed')
    for filename, constraint in [(p, False) for p in options.requirements] + [(p, True) for p in options.constraints] + [(p, True) for p in getattr(options, 'build_constraints', [])]:
        for line in parser.parse(filename, constraint):
            if line.requirement is not None:
                inspect_reference(install_req_from_parsed_requirement(req_file.handle_requirement_line(line, options)))
    for editable in options.editables:
        inspect_reference(install_req_from_editable(editable))
except BaseException as exc:
    print('Windows StringZilla wheel policy could not be verified: ' + str(exc) + '. Use inspectable local requirements/constraints; remove conflicting binary-format directives and StringZilla source references. Check managed pip compatibility before retrying.', file=sys.stderr)
    sys.exit(1)
`;

// Apply to every ordinary node, including optional and indirect StringZilla users.
export function ordinaryNodePipArgs(requirementsPath: string, platform: string = process.platform): string[] {
  return ['-m', 'pip', 'install', ...(platform === 'win32' ? ['--prefer-binary', '--only-binary=stringzilla'] : []), '-r', requirementsPath];
}

export function ordinaryNodeRequirementsMarker(content: string, platform: string = process.platform): string {
  // Expire pre-guard Windows evidence without changing Linux or the reviewed DaSiWa recipe.
  return Bun.hash(platform === 'win32' ? `${content}\numbra-windows-stringzilla-wheel-v2` : content).toString();
}

export function installOrdinaryNodeRequirements(
  python: string, comfyRoot: string, requirementsPath: string, markerPath: string,
  nodeName: string, log: (message: string) => void, platform: string = process.platform, forceRequirements = false,
): boolean {
  const marker = ordinaryNodeRequirementsMarker(readFileSync(requirementsPath, 'utf8'), platform);
  let matchingMarker = false;
  try { matchingMarker = readFileSync(markerPath, 'utf8').trim() === marker; }
  catch { /* Missing or stale evidence needs requirements sync. */ }
  if (platform === 'win32') {
    const preflight = spawnSync(python, ['-c', WINDOWS_WHEEL_PREFLIGHT, requirementsPath], { cwd: comfyRoot, stdio: 'inherit' });
    if (preflight.status !== 0) {
      if (matchingMarker) unlinkSync(markerPath);
      log(`Windows StringZilla wheel policy blocked requirements for ${nodeName}. Review local/nested requirements, active constraints, binary-format directives and source references; no installation was attempted.`);
      return false;
    }
  }
  if (matchingMarker && !forceRequirements) return true;
  // A failed targeted repair must not leave matching success evidence behind.
  if (matchingMarker && forceRequirements) unlinkSync(markerPath);
  log(`Installing requirements for ${nodeName}...`);
  // Inherit pip configuration, indexes and constraints, and retain its raw failure output.
  const result = spawnSync(python, ordinaryNodePipArgs(requirementsPath, platform), { cwd: comfyRoot, stdio: 'inherit' });
  if (result.status !== 0) {
    log(`Failed to install requirements for ${nodeName}${result.error ? `: ${result.error.message}` : ''}`);
    if (platform === 'win32') {
      log('If pip reports no compatible StringZilla wheel, check wheel availability for this interpreter and architecture (python -m pip debug --verbose), the configured indexes and active constraints. Use an index with a wheel satisfying the upstream requirements and retained constraints; review conflicts before retrying. StringZilla source builds are blocked for ordinary node setup.');
      log('If another intentional source package requires a compiler, Microsoft C++ Build Tools and the matching Windows SDK provide build tools; Visual C++ Redistributables only provide runtime libraries. Review the original pip error above.');
    }
    return false;
  }
  writeFileSync(markerPath, `${marker}\n`, 'utf8');
  return true;
}
