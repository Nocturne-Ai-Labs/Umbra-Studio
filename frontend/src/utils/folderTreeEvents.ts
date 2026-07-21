export const FOLDER_TREE_CHANGED_EVENT = 'umbra:folder-tree-changed';

const OUTPUT_ROOT = 'Tools/ComfyUI/output' as const;
const TRASH_ROOT = 'User/Trash' as const;
const LEGACY_OUTPUT_ROOT = 'User/Outputs' as const;

const isAbsolutePathInput = (input: string): boolean => (
  input.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(input)
);

export type SidebarRootPath = string;

export function getSidebarRootPath(path: string | null | undefined): SidebarRootPath | null {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return null;
  if (normalized === OUTPUT_ROOT || normalized.startsWith(`${OUTPUT_ROOT}/`)) return OUTPUT_ROOT;
  // Legacy compatibility for older saved paths/events.
  if (normalized === LEGACY_OUTPUT_ROOT || normalized.startsWith(`${LEGACY_OUTPUT_ROOT}/`)) return OUTPUT_ROOT;
  if (normalized === TRASH_ROOT || normalized.startsWith(`${TRASH_ROOT}/`)) return TRASH_ROOT;
  if (isAbsolutePathInput(normalized)) return normalized;
  return null;
}

export function emitFolderTreeChanged(
  paths: Array<string | null | undefined> = [],
  reason = 'changed',
) {
  if (typeof window === 'undefined') return;

  const normalizedPaths = paths
    .map((path) => String(path || '').replace(/\\/g, '/').replace(/\/+$/, '').trim())
    .filter(Boolean);
  const roots = new Set<SidebarRootPath>();
  let hasExternalOrUnknownPath = false;
  for (const path of normalizedPaths) {
    const root = getSidebarRootPath(path);
    if (!root) {
      hasExternalOrUnknownPath = true;
      continue;
    }
    if (root === OUTPUT_ROOT || root === TRASH_ROOT) {
      roots.add(root);
      continue;
    }
    hasExternalOrUnknownPath = true;
  }

  // Fallback: refresh all folder trees if no scoped root could be inferred.
  if (roots.size === 0 || hasExternalOrUnknownPath) {
    window.dispatchEvent(
      new CustomEvent(FOLDER_TREE_CHANGED_EVENT, {
        detail: { reason, at: Date.now(), paths: normalizedPaths },
      }),
    );
  }

  for (const rootPath of roots) {
    window.dispatchEvent(
      new CustomEvent(FOLDER_TREE_CHANGED_EVENT, {
        detail: { rootPath, reason, at: Date.now(), paths: normalizedPaths },
      }),
    );
  }
}
