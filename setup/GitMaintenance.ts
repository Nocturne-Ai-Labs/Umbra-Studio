import { resolve } from 'node:path';

export function sameGitCheckout(actual: string, expected: string, platform: string = process.platform): boolean {
  const normalize = (path: string) => platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  return normalize(actual) === normalize(expected);
}

export function gitMaintenanceFailure(label: string, stderr: string): string {
  const detail = String(stderr || '').trim().slice(-2000) || 'Review Git access and retry.';
  const ownership = /dubious ownership|unsafe repository|safe\.directory/i.test(detail);
  return `${label}: Git verification failed. ${detail}${ownership ? ' Review this exact checkout\'s owner and access permissions. Setup did not change global Git trust.' : ''} Local files and commits were preserved.`;
}
