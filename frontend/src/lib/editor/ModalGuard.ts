/**
 * ModalGuard — Simple modal stack to prevent keyboard shortcuts
 * from firing while modals (export dialogs, etc.) are open.
 */

const modalStack: string[] = [];

export function pushModal(id: string): void {
  modalStack.push(id);
}

export function popModal(id: string): void {
  const idx = modalStack.lastIndexOf(id);
  if (idx !== -1) modalStack.splice(idx, 1);
}

export function isModalOpen(): boolean {
  return modalStack.length > 0;
}
