// Immutable upstream post6 wheels use Python ABI3 and libtorch's stable ABI.
// Reviewed against release metadata and wheel METADATA, 2026-10-07.
const RELEASE = 'https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post6/';
export function reviewedSageWindowsArtifact(torch: string, cuda: string, python: string, arch = process.arch) {
  const torchMatch = /^2\.(\d+)\./.exec(torch);
  const pythonMatch = /^3\.(\d+)\./.exec(python);
  if (arch !== 'x64' || !torchMatch || Number(torchMatch[1]) < 10 || Number(torchMatch[1]) > 14
    || !pythonMatch || Number(pythonMatch[1]) < 10 || Number(pythonMatch[1]) > 14) return null;
  const variants = {
    '12.8': { tag: 'cu128', bytes: 16871451, sha256: '103e06df49486daa87c3338bf2490ada2b074da1422f2b90566a8f2f81a6b76e' },
    '13.0': { tag: 'cu130', bytes: 16656067, sha256: '1635283f5c01ec3cda58a784d0d7eabbcaffaf9511d1b263db4750e1ed7958bb' },
  } as const;
  const variant = variants[cuda as keyof typeof variants];
  if (!variant) return null;
  const filename = `sageattention-2.2.0+${variant.tag}torch2.10.0andhigher.post6-cp310-abi3-win_amd64.whl`;
  return { filename, url: RELEASE + encodeURIComponent(filename), bytes: variant.bytes, sha256: variant.sha256 };
}
