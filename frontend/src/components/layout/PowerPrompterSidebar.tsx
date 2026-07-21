import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Folder,
  FolderOpen,
  FileText,
  Plus,
  FolderPlus,
  Trash2,
  Edit,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FilePlus as FilePlusIcon,
  ClipboardPaste
} from 'lucide-react';
import { useContextMenu, type ContextMenuItem } from '@/hooks/useContextMenu';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useModal } from '@/hooks/useModal';
import { useStore } from '@/store/useStore';
import type { PowerPrompterCardDocument, PowerPrompterCardNode, PowerPrompterCardType } from '@/types/powerPrompter';
import { createDefaultPowerPrompterCardDocument, normalizePowerPrompterCardDocument } from '@/lib/powerPrompter';
import {
  clearPowerPrompterCardClipboard,
  readPowerPrompterCardClipboard,
  subscribePowerPrompterCardClipboard,
  type PowerPrompterCardClipboardPayload,
} from '@/lib/powerPrompterCardClipboard';
import { deletePathsWithSettings } from '@/utils/trashActions';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileItem[];
  isExpanded?: boolean;
  format?: 'ppcards' | 'txt';
  modelType?: string;
  modelColor?: string;
}

const waitForUiPaint = (timeoutMs = 250): Promise<void> => new Promise((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    setTimeout(finish, 0);
    return;
  }
  const fallback = window.setTimeout(finish, Math.max(50, timeoutMs));
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      window.clearTimeout(fallback);
      finish();
    }, 0);
  });
});

interface FileModelMeta {
  modelType: string;
  modelColor: string;
}

interface FileTagEditorState {
  mode: 'create' | 'edit';
  path: string;
  folderPath: string;
  fileName: string;
  modelType: string;
  modelColor: string;
}

interface PowerPrompterSidebarProps {
  currentFile: string | null;
  onFileOpenStart?: (path: string) => void;
  onFileOpenFailed?: () => void;
  onSelectFile: (path: string, content: string) => void;
  onDeleteFile: (path: string) => void;
  overlayMode?: boolean;
  menuMode?: boolean;
}

export const PowerPrompterSidebar = React.memo(({
  currentFile,
  onFileOpenStart,
  onFileOpenFailed,
  onSelectFile,
  onDeleteFile,
  overlayMode = false,
  menuMode = false,
}: PowerPrompterSidebarProps) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<FileItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [cardClipboard, setCardClipboard] = useState<PowerPrompterCardClipboardPayload | null>(null);
  const [fileMetaByPath, setFileMetaByPath] = useState<Record<string, FileModelMeta>>({});
  const [fileTagEditor, setFileTagEditor] = useState<FileTagEditorState | null>(null);
  const fileMetaByPathRef = useRef<Record<string, FileModelMeta>>({});
  const pendingMetaLoadsRef = useRef(new Map<string, Promise<FileModelMeta | null>>());
  const metadataHydrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadataHydrationTokenRef = useRef(0);
  const { show, hide, isOpen, position, targetPath } = useContextMenu();
  const modal = useModal();
  const showToast = useStore((state) => state.showToast);
  const appSettings = useStore((state) => state.appSettings);

  const ROOT_PATH = 'User/PowerPrompter/Prompts';
  const PP_CARD_DOC_EXT = '.ppcards.json';
  const LEGACY_PROMPT_README_NAME = 'readme.txt';

  const normalizeModelType = (rawValue: unknown) => String(rawValue || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const normalizeModelColor = (rawValue: unknown) => {
    const value = String(rawValue || '').trim();
    if (!value) return '#38bdf8';
    const normalized = value.startsWith('#') ? value : `#${value}`;
    return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : '#38bdf8';
  };
  const stripPromptFileExtension = (rawName: string) => {
    const name = String(rawName || '').trim();
    if (!name) return '';
    const lower = name.toLowerCase();
    if (lower.endsWith(PP_CARD_DOC_EXT)) return name.slice(0, -PP_CARD_DOC_EXT.length);
    if (lower.endsWith('.txt')) return name.slice(0, -4);
    if (lower.endsWith('.json')) return name.slice(0, -5);
    return name;
  };
  const buildPromptFileName = (rawName: string, format: 'ppcards' | 'txt' = 'ppcards') => {
    const baseName = stripPromptFileExtension(rawName).trim();
    if (!baseName) return '';
    return format === 'txt' ? `${baseName}.txt` : `${baseName}${PP_CARD_DOC_EXT}`;
  };

  useEffect(() => {
    loadFiles(ROOT_PATH);
  }, []);

  useEffect(() => {
    setCardClipboard(readPowerPrompterCardClipboard());
    return subscribePowerPrompterCardClipboard((payload) => {
      setCardClipboard(payload);
    });
  }, []);

  useEffect(() => () => {
    if (metadataHydrationTimerRef.current) {
      clearTimeout(metadataHydrationTimerRef.current);
      metadataHydrationTimerRef.current = null;
    }
    metadataHydrationTokenRef.current += 1;
  }, []);

  useEffect(() => {
    fileMetaByPathRef.current = fileMetaByPath;
  }, [fileMetaByPath]);

  const createCardId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `pp-card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const createSlotId = (type: PowerPrompterCardType, label: string) => {
    const slug = String(label || type)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || String(type);
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `pp-slot-${slug}-${crypto.randomUUID()}`;
    }
    return `pp-slot-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  const normalizeCustomLabel = (value: string) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const getCardGroupKey = (type: PowerPrompterCardType, label: string) => (
    normalizeCustomLabel(label || '').length > 0
      ? `label:${normalizeCustomLabel(label)}`
      : `type:${String(type || 'custom').trim().toLowerCase()}`
  );

  const normalizeQueueSetIds = (rawSetIds: unknown, fallbackEnabled = true): number[] => {
    if (!Array.isArray(rawSetIds)) return fallbackEnabled ? [1] : [];
    const normalized = Array.from(new Set(
      rawSetIds
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.floor(value))
        .filter((value) => value >= 1 && value <= 10)
    )).sort((a, b) => a - b);
    if (normalized.length === 0 && fallbackEnabled) return [1];
    return normalized;
  };

  const normalizeRandomSetIds = (rawSetIds: unknown): number[] => normalizeQueueSetIds(rawSetIds, false);

  const loadCardDocument = async (path: string): Promise<PowerPrompterCardDocument> => {
    const res = await fetch(`/api/powerprompter/cards?file=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Failed to load card document (${res.status})`);
    const payload = await res.json();
    return normalizePowerPrompterCardDocument(payload?.document, path);
  };

  const saveCardDocument = async (path: string, document: PowerPrompterCardDocument) => {
    const res = await fetch('/api/powerprompter/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: path, document, intent: 'sidebar-card-operation' }),
    });
    if (!res.ok) throw new Error(`Failed to save card document (${res.status})`);
  };

  const extractModelMeta = (document: PowerPrompterCardDocument): FileModelMeta => ({
    modelType: normalizeModelType((document as any).modelType),
    modelColor: normalizeModelColor((document as any).modelColor),
  });

  const applyMetaToTree = (items: FileItem[], metaByPath: Record<string, FileModelMeta>): FileItem[] =>
    items.map((item) => {
      if (item.isDirectory) {
        return {
          ...item,
          children: item.children ? applyMetaToTree(item.children, metaByPath) : item.children,
        };
      }
      const meta = metaByPath[item.path];
      if (!meta) return item;
      return {
        ...item,
        modelType: meta.modelType,
        modelColor: meta.modelColor,
      };
    });

  const loadFileMeta = async (path: string): Promise<FileModelMeta | null> => {
    const cached = fileMetaByPathRef.current[path];
    if (cached) return cached;
    const existing = pendingMetaLoadsRef.current.get(path);
    if (existing) return await existing;

    const task = (async () => {
      try {
        const doc = await loadCardDocument(path);
        return extractModelMeta(doc);
      } catch {
        return null;
      }
    })();
    pendingMetaLoadsRef.current.set(path, task);
    try {
      return await task;
    } finally {
      pendingMetaLoadsRef.current.delete(path);
    }
  };

  const hydrateMetadataForFiles = async (items: FileItem[], token: number) => {
    const filePaths = items
      .filter((item) => !item.isDirectory)
      .map((item) => item.path)
      .filter((path) => !fileMetaByPathRef.current[path]);
    if (filePaths.length === 0) return;

    const updates: Record<string, FileModelMeta> = {};
    const queue = [...filePaths];
    const workerCount = Math.min(2, queue.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        if (metadataHydrationTokenRef.current !== token) return;
        const path = queue.shift();
        if (!path) return;
        const meta = await loadFileMeta(path);
        if (meta) {
          updates[path] = meta;
        }
      }
    }));
    if (metadataHydrationTokenRef.current !== token) return;
    if (Object.keys(updates).length === 0) return;

    setFileMetaByPath((prev) => ({ ...prev, ...updates }));
    setFiles((prev) => applyMetaToTree(prev, updates));
  };

  const scheduleMetadataHydrationForFiles = (items: FileItem[]) => {
    if (metadataHydrationTimerRef.current) {
      clearTimeout(metadataHydrationTimerRef.current);
      metadataHydrationTimerRef.current = null;
    }
    const token = metadataHydrationTokenRef.current + 1;
    metadataHydrationTokenRef.current = token;
    metadataHydrationTimerRef.current = setTimeout(() => {
      metadataHydrationTimerRef.current = null;
      void hydrateMetadataForFiles(items, token);
    }, 1200);
  };

  const removeSlotFromDocument = (document: PowerPrompterCardDocument, path: string, slotId: string): PowerPrompterCardDocument => {
    const removed = document.cards.filter((card) => String(card.slotId || '') === slotId);
    const remaining = document.cards.filter((card) => String(card.slotId || '') !== slotId);
    const nextDeletedGroups = { ...(document.deletedCardGroups || {}) };
    const firstRemoved = removed[0];
    if (firstRemoved) {
      const groupKey = getCardGroupKey(firstRemoved.type, String(firstRemoved.label || ''));
      nextDeletedGroups[groupKey] = {
        key: groupKey,
        type: firstRemoved.type,
        label: String(firstRemoved.label || '').trim() || (firstRemoved.type === 'custom' ? 'Custom' : firstRemoved.type),
        deletedAt: new Date().toISOString(),
        cards: removed
          .map((card, idx) => ({ ...card, order: idx }))
          .sort((a, b) => Number(a.order) - Number(b.order)),
      };
    }
    if (remaining.length === 0) {
      const fallback = createDefaultPowerPrompterCardDocument(path);
      return {
        ...fallback,
        file: path,
        deletedCardGroups: nextDeletedGroups,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      ...document,
      file: path,
      updatedAt: new Date().toISOString(),
      cards: remaining.map((card, idx) => ({ ...card, order: idx })),
      deletedCardGroups: nextDeletedGroups,
    };
  };

  const pasteCardIntoDocument = (
    document: PowerPrompterCardDocument,
    path: string,
    clipboardPayload: PowerPrompterCardClipboardPayload
  ): PowerPrompterCardDocument => {
    const now = new Date().toISOString();
    const incomingType = clipboardPayload.slot.type;
    const incomingLabel = String(clipboardPayload.slot.label || '').trim() || 'Custom';
    const incomingVariants = clipboardPayload.slot.variants.map((variant, idx) => {
      const queueSetIds = normalizeQueueSetIds(variant.queueSetIds, variant.queueEnabled !== false);
      const randomSetIds = normalizeRandomSetIds(variant.randomSetIds);
      return {
        ...variant,
        id: createCardId(),
        slotId: '',
        type: incomingType,
        label: incomingLabel,
        text: String(variant.text || ''),
        randomEnabled: variant.randomEnabled === true,
        randomSetIds,
        queueSetIds,
        queueEnabled: queueSetIds.length > 0,
        createdAt: String(variant.createdAt || now),
        updatedAt: now,
        order: idx,
      };
    });

    const cards = [...document.cards];
    let targetSlotId: string | null = null;
    let targetLabel = incomingLabel;

    const existingCardsByOrder = [...cards].sort((a, b) => Number(a.order) - Number(b.order));
    if (incomingType === 'custom') {
      const key = normalizeCustomLabel(incomingLabel);
      const existing = existingCardsByOrder.find((card) =>
        String(card.type) === 'custom' && normalizeCustomLabel(card.label) === key
      );
      if (existing) {
        targetSlotId = String(existing.slotId || '');
        targetLabel = String(existing.label || incomingLabel);
      }
    } else {
      const existing = existingCardsByOrder.find((card) => String(card.type) === incomingType);
      if (existing) {
        targetSlotId = String(existing.slotId || '');
        targetLabel = String(existing.label || incomingLabel);
      }
    }

    if (!targetSlotId) {
      targetSlotId = createSlotId(incomingType, incomingLabel);
    }

    const seeded = incomingVariants.map((variant) => ({
      ...variant,
      slotId: targetSlotId as string,
      type: incomingType,
      label: targetLabel,
    }));

    const nextCards = [...cards, ...seeded].map((card, idx) => ({ ...card, order: idx }));
    return {
      ...document,
      file: path,
      updatedAt: now,
      cards: nextCards,
    };
  };

  const refreshOpenFileIfNeeded = async (path: string) => {
    if (currentFile !== path) return;
    try {
      const isJsonDoc = String(path || '').toLowerCase().endsWith(PP_CARD_DOC_EXT);
      const content = isJsonDoc
        ? ''
        : await (async () => {
          const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
          if (!res.ok) throw new Error('Failed to read file');
          return await res.text();
        })();
      onSelectFile(path, content);
    } catch {
      // no-op
    }
  };

  const loadFiles = async (path: string) => {
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}&filter=text`);
      if (!res.ok) throw new Error('Failed to list files');

      const data = await res.json();

      const folderItems: FileItem[] = (data.folders || []).map((item: any) => ({
        name: item.name,
        path: item.path,
        isDirectory: true,
        children: [],
        isExpanded: false
      }));

      const fileMap = new Map<string, FileItem>();
      for (const item of (data.files || [])) {
        const name = String(item?.name || '');
        const lower = name.toLowerCase();
        const pathValue = String(item?.path || '');
        if (!pathValue) continue;
        if (lower === LEGACY_PROMPT_README_NAME) continue;

        if (lower.endsWith('.ppcards.json')) {
          const key = name.replace(/\.ppcards\.json$/i, '').toLowerCase();
          const meta = fileMetaByPath[pathValue];
          fileMap.set(key, {
            name,
            path: pathValue,
            isDirectory: false,
            format: 'ppcards',
            modelType: meta?.modelType || '',
            modelColor: meta?.modelColor || '#38bdf8',
          });
          continue;
        }

        if (lower.endsWith('.txt')) {
          const key = name.replace(/\.txt$/i, '').toLowerCase();
          if (!fileMap.has(key)) {
            const meta = fileMetaByPath[pathValue];
            fileMap.set(key, {
              name,
              path: pathValue,
              isDirectory: false,
              format: 'txt',
              modelType: meta?.modelType || '',
              modelColor: meta?.modelColor || '#38bdf8',
            });
          }
        }
      }

      const fileItems: FileItem[] = Array.from(fileMap.values());

      const allItems = [...folderItems, ...fileItems];
      allItems.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      if (path === ROOT_PATH) {
        setFiles(allItems);
      } else {
        setFiles(prev => updateTreeChildren(prev, path, allItems));
      }
      scheduleMetadataHydrationForFiles(fileItems);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  const updateTreeChildren = (items: FileItem[], targetPath: string, newChildren: FileItem[]): FileItem[] => {
    return items.map(item => {
      if (item.path === targetPath) {
        return { ...item, children: newChildren, isExpanded: true };
      }
      if (item.children) {
        return { ...item, children: updateTreeChildren(item.children, targetPath, newChildren) };
      }
      return item;
    });
  };

  const toggleFolder = async (item: FileItem) => {
    if (item.isExpanded) {
      const collapse = (items: FileItem[]): FileItem[] => items.map(i => {
        if (i.path === item.path) return { ...i, isExpanded: false };
        if (i.children) return { ...i, children: collapse(i.children) };
        return i;
      });
      setFiles(collapse(files));
    } else {
      await loadFiles(item.path);
    }
  };

  const handleFileClick = async (item: FileItem) => {
    if (item.isDirectory) {
      toggleFolder(item);
      return;
    }

    try {
      if (metadataHydrationTimerRef.current) {
        clearTimeout(metadataHydrationTimerRef.current);
        metadataHydrationTimerRef.current = null;
      }
      metadataHydrationTokenRef.current += 1;
      flushSync(() => {
        onFileOpenStart?.(item.path);
      });
      await waitForUiPaint();
      const isJsonDoc = item.format === 'ppcards' || String(item.path || '').toLowerCase().endsWith(PP_CARD_DOC_EXT);
      const content = isJsonDoc
        ? ''
        : await (async () => {
          const res = await fetch(`/api/fs/read?path=${encodeURIComponent(item.path)}`);
          if (!res.ok) throw new Error('Failed to read file');
          return await res.text();
        })();
      onSelectFile(item.path, content);
    } catch (err) {
      console.error('Failed to open file:', err);
      onFileOpenFailed?.();
      showToast('Failed to open file', 'error');
    }
  };

  const openCreateFileDialog = (folderPath: string = ROOT_PATH) => {
    setFileTagEditor({
      mode: 'create',
      path: '',
      folderPath,
      fileName: 'new_batch',
      modelType: '',
      modelColor: '#38bdf8',
    });
  };

  const openEditFileTagDialog = (path: string) => {
    const meta = fileMetaByPath[path];
    const currentName = path.split('/').pop() || '';
    setFileTagEditor({
      mode: 'edit',
      path,
      folderPath: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ROOT_PATH,
      fileName: stripPromptFileExtension(currentName),
      modelType: normalizeModelType(meta?.modelType),
      modelColor: normalizeModelColor(meta?.modelColor),
    });
  };

  const handleSaveFileTagEditor = async () => {
    if (!fileTagEditor) return;
    const nextModelType = normalizeModelType(fileTagEditor.modelType);
    const nextModelColor = normalizeModelColor(fileTagEditor.modelColor);

    if (fileTagEditor.mode === 'create') {
      const rawName = String(fileTagEditor.fileName || '').trim();
      const fileName = buildPromptFileName(rawName, 'ppcards');
      if (!fileName) {
        showToast('File name is required', 'error');
        return;
      }
      const path = `${fileTagEditor.folderPath || ROOT_PATH}/${fileName}`;
      const cardDocument = {
        ...createDefaultPowerPrompterCardDocument(path),
        modelType: nextModelType,
        modelColor: nextModelColor,
      };

      try {
        const createRes = await fetch('/api/powerprompter/cards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: path, document: cardDocument, intent: 'create-card' })
        });
        if (!createRes.ok) {
          throw new Error(`Create failed (${createRes.status})`);
        }

        setFileMetaByPath((prev) => ({
          ...prev,
          [path]: { modelType: nextModelType, modelColor: nextModelColor },
        }));
        setFileTagEditor(null);
        await loadFiles(fileTagEditor.folderPath || ROOT_PATH);
        onSelectFile(path, '');
        showToast('File created', 'success');
      } catch {
        showToast('Failed to create file', 'error');
      }
      return;
    }

    try {
      const targetPath = fileTagEditor.path;
      if (!targetPath) return;
      const existingDoc = await loadCardDocument(targetPath);
      const updatedDoc: PowerPrompterCardDocument = {
        ...existingDoc,
        modelType: nextModelType,
        modelColor: nextModelColor,
        updatedAt: new Date().toISOString(),
      };
      await saveCardDocument(targetPath, updatedDoc);
      setFileMetaByPath((prev) => ({
        ...prev,
        [targetPath]: { modelType: nextModelType, modelColor: nextModelColor },
      }));
      setFiles((prev) => applyMetaToTree(prev, {
        [targetPath]: { modelType: nextModelType, modelColor: nextModelColor },
      }));
      await refreshOpenFileIfNeeded(targetPath);
      setFileTagEditor(null);
      showToast('File tag updated', 'success');
    } catch {
      showToast('Failed to update file tag', 'error');
    }
  };

  const handleCreateFile = async (folderPath: string = ROOT_PATH) => {
    openCreateFileDialog(folderPath);
  };

  const handleCreateFolder = async (folderPath: string = ROOT_PATH) => {
    const name = await modal.prompt('Enter folder name:', 'new_folder', 'Create Folder');
    if (!name) return;

    const path = `${folderPath}/${name}`;

    try {
      await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      loadFiles(folderPath);
      showToast('Folder created', 'success');
    } catch (err) {
      showToast('Failed to create folder', 'error');
    }
  };

  const handleRefreshFiles = async () => {
    await loadFiles(ROOT_PATH);
    showToast('Directory refreshed', 'success');
  };

  const handlePasteCardToFile = async (targetPath: string) => {
    const clipboardPayload = readPowerPrompterCardClipboard();
    if (!clipboardPayload) {
      showToast('No card in clipboard', 'error');
      return;
    }
    if (clipboardPayload.mode === 'cut' && clipboardPayload.sourceFile && clipboardPayload.sourceFile === targetPath) {
      showToast('Choose a different file for move', 'error');
      return;
    }

    try {
      const targetDoc = await loadCardDocument(targetPath);
      const pastedDoc = pasteCardIntoDocument(targetDoc, targetPath, clipboardPayload);
      await saveCardDocument(targetPath, pastedDoc);

      if (clipboardPayload.mode === 'cut' && clipboardPayload.sourceFile) {
        const sourcePath = clipboardPayload.sourceFile;
        try {
          const sourceDoc = await loadCardDocument(sourcePath);
          const cleanedSourceDoc = removeSlotFromDocument(sourceDoc, sourcePath, clipboardPayload.slot.slotId);
          await saveCardDocument(sourcePath, cleanedSourceDoc);
        } catch {
          // Keep paste successful even if source cleanup fails.
        }
        clearPowerPrompterCardClipboard();
      }

      await loadFiles(ROOT_PATH);
      await refreshOpenFileIfNeeded(targetPath);
      if (clipboardPayload.mode === 'cut' && clipboardPayload.sourceFile) {
        await refreshOpenFileIfNeeded(clipboardPayload.sourceFile);
      }
      showToast(clipboardPayload.mode === 'cut' ? 'Card moved' : 'Card pasted', 'success');
    } catch (error) {
      console.error('Failed to paste card into file', error);
      showToast('Failed to paste card', 'error');
    }
  };

  const handleDelete = async (path: string, isDirectory: boolean) => {
    if (!await modal.confirm('Delete this item?', 'Delete')) return;

    try {
      const parentPath = path.substring(0, path.lastIndexOf('/'));
      const pathsToDelete = [path];
      if (!isDirectory && path.toLowerCase().endsWith('.txt')) {
        const sidecarPath = `${path}.ppcards.json`;
        try {
          const sidecarRes = await fetch(`/api/fs/read?path=${encodeURIComponent(sidecarPath)}`);
          if (sidecarRes.ok) pathsToDelete.push(sidecarPath);
        } catch {
          // no-op
        }
      }
      const deleteResult = await deletePathsWithSettings(pathsToDelete, appSettings);
      if (deleteResult.deletedPaths.length === 0 && deleteResult.failed.length > 0) {
        throw new Error(deleteResult.failed[0].error || 'Failed to delete');
      }
      loadFiles(parentPath || ROOT_PATH);
      if (currentFile === path) onDeleteFile(path);
      showToast('Deleted', 'success');
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  const handleRename = async (path: string) => {
    const currentName = path.split('/').pop() || '';
    const lowerName = currentName.toLowerCase();
    const isPromptFile = lowerName.endsWith(PP_CARD_DOC_EXT) || lowerName.endsWith('.txt');
    const currentDisplayName = isPromptFile ? stripPromptFileExtension(currentName) : currentName;
    const newNameInput = await modal.prompt('Enter new name:', currentDisplayName, 'Rename');
    if (!newNameInput) return;

    const targetName = isPromptFile
      ? buildPromptFileName(newNameInput, lowerName.endsWith('.txt') ? 'txt' : 'ppcards')
      : String(newNameInput || '').trim();
    if (!targetName) {
      showToast('File name is required', 'error');
      return;
    }
    if (targetName === currentName) return;

    const parentPath = path.substring(0, path.lastIndexOf('/'));

    try {
      const res = await fetch('/api/fs/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath: path, name: targetName })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.error) {
        throw new Error(String(payload?.error || 'Rename failed'));
      }
      const newPath = String(payload?.newPath || '').trim();
      if (newPath && newPath !== path) {
        setFileMetaByPath((prev) => {
          const currentMeta = prev[path];
          if (!currentMeta) return prev;
          const next = { ...prev };
          delete next[path];
          next[newPath] = currentMeta;
          return next;
        });
        if (currentFile === path) {
          try {
            const isJsonDoc = newPath.toLowerCase().endsWith(PP_CARD_DOC_EXT);
            if (isJsonDoc) {
              onSelectFile(newPath, '');
            } else {
              const readRes = await fetch(`/api/fs/read?path=${encodeURIComponent(newPath)}`);
              if (readRes.ok) {
                const content = await readRes.text();
                onSelectFile(newPath, content);
              }
            }
          } catch {
            // no-op
          }
        }
      }
      loadFiles(parentPath || ROOT_PATH);
      showToast('Renamed', 'success');
    } catch (err: any) {
      showToast(String(err?.message || 'Failed to rename'), 'error');
    }
  };

  const handleMove = async (sourcePath: string, targetFolderPath: string) => {
    const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf('/'));

    // Don't move to same location
    if (sourceParent === targetFolderPath) return;

    // Don't move a folder into itself or its children
    if (targetFolderPath.startsWith(sourcePath + '/')) {
      showToast('Cannot move folder into itself', 'error');
      return;
    }

    try {
      const res = await fetch('/api/fs/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [sourcePath], destination: targetFolderPath })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Move failed');
      }

      // Reload both source and target directories
      loadFiles(sourceParent || ROOT_PATH);
      if (targetFolderPath !== sourceParent) {
        loadFiles(targetFolderPath);
      }

      const targetName = targetFolderPath === ROOT_PATH ? 'root' : targetFolderPath.split('/').pop();
      showToast(`Moved to ${targetName}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to move', 'error');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.path);
    setDraggedItem(item);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, item: FileItem) => {
    e.preventDefault();
    if (!item.isDirectory) return;
    if (draggedItem && draggedItem.path === item.path) return;
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, item: FileItem) => {
    e.preventDefault();
    if (!item.isDirectory) return;
    if (draggedItem && draggedItem.path === item.path) return;
    setDropTarget(item.path);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only clear if we're leaving the actual element, not entering a child
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDropTarget(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetItem: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    if (!targetItem.isDirectory) return;

    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetItem.path) return;

    await handleMove(sourcePath, targetItem.path);
    setDraggedItem(null);
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);

    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;

    const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    if (sourceParent === ROOT_PATH) return; // Already in root

    await handleMove(sourcePath, ROOT_PATH);
    setDraggedItem(null);
  };

  const getContextMenuItems = (path: string, isDirectory: boolean): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (isDirectory) {
      items.push(
        { label: 'New File', icon: <FilePlusIcon size={14} />, action: () => handleCreateFile(path) },
        { label: 'New Folder', icon: <FolderPlus size={14} />, action: () => handleCreateFolder(path) },
        { separator: true }
      );
    } else {
      const cannotPasteMoveToSameFile = cardClipboard?.mode === 'cut' && cardClipboard?.sourceFile === path;
      items.push({
        label: cardClipboard?.mode === 'cut' ? 'Paste Card (Move)' : 'Paste Card',
        icon: <ClipboardPaste size={14} />,
        action: () => handlePasteCardToFile(path),
        disabled: !cardClipboard || cannotPasteMoveToSameFile,
      });
      items.push({
        label: 'Set Model Tag & Color',
        icon: <Edit size={14} />,
        action: () => openEditFileTagDialog(path),
      });
      items.push({ separator: true });
    }
    items.push(
      { label: 'Rename', icon: <Edit size={14} />, action: () => handleRename(path) },
      { label: 'Delete', icon: <Trash2 size={14} />, danger: true, action: () => handleDelete(path, isDirectory) }
    );
    return items;
  };

  const renderTree = (items: FileItem[], depth: number = 0) => {
    return items.map(item => {
      const isDragging = draggedItem?.path === item.path;
      const isDropTarget = dropTarget === item.path && item.isDirectory;

      return (
        <div key={item.path}>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, item)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, item)}
            onDragEnter={(e) => handleDragEnter(e, item)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, item)}
            onMouseDown={(event) => {
              if (!item.isDirectory && event.button === 0) {
                flushSync(() => {
                  onFileOpenStart?.(item.path);
                });
              }
            }}
            onClick={() => handleFileClick(item)}
            onContextMenu={(e) => show(e, item.path)}
            style={{ paddingLeft: `${depth * 12 + 12}px` }}
            className={`
              group flex items-center gap-2 py-1.5 pr-2 rounded-lg cursor-pointer transition-all text-xs font-medium
              ${isDragging ? 'opacity-50' : ''}
              ${isDropTarget
                ? 'bg-[var(--umbra-accent)]/30 ring-1 ring-[var(--umbra-accent)] text-white'
                : currentFile === item.path
                  ? 'bg-[var(--umbra-accent)] text-white shadow-lg shadow-[var(--umbra-accent-glow)]'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'}
            `}
          >
            {item.isDirectory ? (
              <div className={`transition-colors ${isDropTarget ? 'text-[var(--umbra-accent)]' : 'text-zinc-500 group-hover:text-white'}`}>
                {item.isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </div>
            ) : (
              <FileText size={14} className={currentFile === item.path ? 'opacity-100' : 'opacity-50'} />
            )}
            <span className="truncate flex-1">
              {item.isDirectory ? String(item.name ?? '') : stripPromptFileExtension(String(item.name ?? ''))}
            </span>
            {!item.isDirectory && item.modelType && (
              <span
                className="shrink-0 max-w-[110px] truncate px-1.5 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider"
                style={{
                  color: item.modelColor || '#38bdf8',
                  borderColor: `${item.modelColor || '#38bdf8'}88`,
                  backgroundColor: `${item.modelColor || '#38bdf8'}22`,
                }}
                title={item.modelType}
              >
                {item.modelType}
              </span>
            )}
          </div>

          {item.isDirectory && item.isExpanded && item.children && (
            <div className="border-l border-white/5 ml-3 my-1">
              {renderTree(item.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const findItem = (items: FileItem[], path: string): FileItem | null => {
    for (const item of items) {
      if (item.path === path) return item;
      if (item.children) {
        const found = findItem(item.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const targetItem = targetPath ? findItem(files, targetPath) : null;
  const menuItems = targetItem ? getContextMenuItems(targetItem.path, targetItem.isDirectory) : [];

  return (
    <div
      data-umbra-powerprompter-sidebar=""
      className={`${menuMode ? 'h-full min-h-0 w-full max-w-none' : 'h-full w-64 flex-shrink-0 border-r border-white/5'} relative flex flex-col glass-panel`}
      style={overlayMode ? { backgroundColor: 'rgba(5,5,8,0.98)' } : undefined}
    >
      <div className="border-b border-white/5 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-cyan-100">
              <FileText size={13} className="text-cyan-300" />
              <span>ppCards</span>
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">
              Prompt card documents
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
          <button
            onClick={() => handleCreateFolder(ROOT_PATH)}
            className="grid size-7 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-cyan-300/35 hover:bg-cyan-400/10 hover:text-cyan-100"
            title="New Folder"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={() => handleCreateFile(ROOT_PATH)}
            className="grid size-7 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-emerald-300/35 hover:bg-emerald-400/10 hover:text-emerald-100"
            title="New ppCard"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={handleRefreshFiles}
            className="grid size-7 place-items-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          </div>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto p-2.5 space-y-1 custom-scrollbar transition-colors ${dropTarget === ROOT_PATH ? 'bg-cyan-400/10' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (draggedItem) {
            const sourceParent = draggedItem.path.substring(0, draggedItem.path.lastIndexOf('/'));
            if (sourceParent !== ROOT_PATH) {
              setDropTarget(ROOT_PATH);
            }
          }
        }}
        onDragLeave={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const x = e.clientX;
          const y = e.clientY;
          if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            if (dropTarget === ROOT_PATH) setDropTarget(null);
          }
        }}
        onDrop={handleDropOnRoot}
      >
        {files.length === 0 && (
          <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-[10px] uppercase tracking-widest text-zinc-600">
            No ppCards found
          </div>
        )}
        {renderTree(files)}
      </div>

      <ContextMenu
        isOpen={isOpen}
        position={position}
        items={menuItems}
        onClose={hide}
      />

      {fileTagEditor && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="w-full max-w-[320px] rounded-xl border border-white/15 bg-[#07090f] shadow-2xl shadow-black/70 p-3 space-y-2">
            <div className="text-[11px] font-black uppercase tracking-widest text-zinc-300">
              {fileTagEditor.mode === 'create' ? 'Create Prompt File' : 'Set Model Family'}
            </div>
            {fileTagEditor.mode === 'create' && (
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">File Name (No Extension)</span>
                <input
                  value={fileTagEditor.fileName}
                  onChange={(event) => setFileTagEditor((prev) => prev ? ({ ...prev, fileName: String(event.target.value || '') }) : prev)}
                  className="w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                  placeholder="new_batch"
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Model Family</span>
              <input
                value={fileTagEditor.modelType}
                onChange={(event) => setFileTagEditor((prev) => prev ? ({ ...prev, modelType: String(event.target.value || '') }) : prev)}
                className="w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                placeholder="Anima / SDXL / Flux / Krea 2..."
              />
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Color</span>
                <input
                  value={fileTagEditor.modelColor}
                  onChange={(event) => setFileTagEditor((prev) => prev ? ({ ...prev, modelColor: String(event.target.value || '') }) : prev)}
                  className="w-full bg-black/40 border border-white/15 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-cyan-300"
                  placeholder="#38bdf8"
                />
              </label>
              <input
                type="color"
                value={normalizeModelColor(fileTagEditor.modelColor)}
                onChange={(event) => setFileTagEditor((prev) => prev ? ({ ...prev, modelColor: String(event.target.value || '') }) : prev)}
                className="h-8 w-10 rounded border border-white/15 bg-transparent cursor-pointer"
                title="Pick color"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setFileTagEditor(null)}
                className="px-2.5 py-1.5 rounded border border-white/15 bg-white/[0.04] text-[11px] font-semibold text-zinc-300 hover:text-zinc-100 hover:border-white/30"
              >
                Cancel
              </button>
              <button
                onClick={() => { void handleSaveFileTagEditor(); }}
                className="px-2.5 py-1.5 rounded border border-cyan-400/45 bg-cyan-500/14 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-500/22"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

PowerPrompterSidebar.displayName = 'PowerPrompterSidebar';
