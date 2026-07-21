import { useState, useEffect, type DragEvent } from 'react';
import { Archive, Trash2, Move, Tag, Check, CheckSquare, Square, Loader2, Upload, X, Flag, Sparkles, Copy, FolderOpen } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useDropZone } from '@/lib/dnd';
import { showInFileExplorer } from '@/utils/fileExplorer';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { DatasetTree } from './components/DatasetTree';
import { CaptionEditor } from './components/CaptionEditor';
import { DatasetLightbox } from './components/DatasetLightbox';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { useDatasets } from './hooks/useDatasets';
import type { DatasetConceptSettings } from './hooks/useDatasets';
import type { DatasetImage } from './types';

const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
const WAIFU_MODEL_OPTIONS = [
  { id: 'SmilingWolf/wd-vit-tagger-v3', label: 'wd-vit' },
  { id: 'SmilingWolf/wd-convnext-tagger-v3', label: 'wd-convnext' },
  { id: 'SmilingWolf/wd-eva02-large-tagger-v3', label: 'wd-eva02' },
  { id: 'SmilingWolf/wd-swinv2-tagger-v3', label: 'wd-swinv2' },
];
const NATURAL_MODEL_OPTIONS = [
  {
    id: 'prithivMLmods/Qwen2-VL-2B-Abliterated-Caption-it',
    label: 'Qwen2-VL 2B Uncensored',
  },
];

const DEFAULT_CONCEPT_SETTINGS: DatasetConceptSettings = {
  triggerTags: '',
  prependTags: '',
  captionMode: 'tags',
  modelRepo: WAIFU_MODEL_OPTIONS[0].id,
  naturalModelRepo: NATURAL_MODEL_OPTIONS[0].id,
  naturalDevice: 'auto',
  naturalMaxNewTokens: 192,
  generalThreshold: 0.35,
  characterThreshold: 0.85,
  ratingThreshold: 0.25,
  generalMcutEnabled: false,
  characterMcutEnabled: false,
  includeGeneralTags: true,
  includeCharacterTags: true,
  includeCopyrightTags: false,
  includeArtistTags: false,
  includeMetaTags: false,
  includeRatingTags: false,
  maxTags: 120,
  preserveExisting: true,
  replaceUnderscoresWithSpaces: false,
};

function isNativeImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_FILE_PATTERN.test(file.name);
}

function formatArchiveBytes(value: number): string {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function getDroppedImageUrl(dataTransfer: DataTransfer): string {
  const uriList = dataTransfer.getData('text/uri-list');
  const plainText = dataTransfer.getData('text/plain');
  const mozUrl = dataTransfer.getData('text/x-moz-url');
  const html = dataTransfer.getData('text/html');
  const candidates = [uriList, plainText, mozUrl]
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith('#'));

  const htmlMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i) || html.match(/https?:\/\/[^\s"'<>]+/i);
  if (htmlMatch) {
    candidates.push(htmlMatch[1] || htmlMatch[0]);
  }

  return candidates.find((value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value)) || '';
}

function hasNativeImageDrop(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types || []);
  if (types.includes('application/json')) return false;
  if (Array.from(dataTransfer.files || []).some(isNativeImageFile)) return true;
  return types.some((type) => ['Files', 'text/uri-list', 'text/plain', 'text/html', 'text/x-moz-url'].includes(type));
}

function extractNativeDroppedImages(dataTransfer: DataTransfer): any[] {
  const images = Array.from(dataTransfer.files || [])
    .filter(isNativeImageFile)
    .map((file) => ({ kind: 'file', file, name: file.name, type: file.type }));

  const url = getDroppedImageUrl(dataTransfer);
  if (url) {
    images.push({ kind: 'url', url });
  }

  return images;
}

export function DatasetsTab() {
  const { showToast } = useStore();
  const {
    datasets,
    createDataset,
    deleteDataset,
    renameDataset,
    archiveDataset,
    createConcept,
    deleteConcept,
    getConceptImages,
    getConceptSettings,
    saveConceptSettings,
    saveCaption,
    moveImages,
    deleteImages,
    error: datasetError,
  } = useDatasets();

  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [selectedConcept, setSelectedConcept] = useState<string | null>(null);
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [focusedImage, setFocusedImage] = useState<DatasetImage | null>(null);
  const [isLoadingImages, setIsLoadingImages] = useState(false);

  // Modal states
  const [showNewDataset, setShowNewDataset] = useState(false);
  const [showNewConcept, setShowNewConcept] = useState<string | null>(null);
  const [renameDatasetTarget, setRenameDatasetTarget] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRepeats, setNewRepeats] = useState(10);
  const [isReg, setIsReg] = useState(false);
  const [moveToConcept, setMoveToConcept] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [nativeDropActive, setNativeDropActive] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [triggerTags, setTriggerTags] = useState('');
  const [prependTags, setPrependTags] = useState('');
  const [captionMode, setCaptionMode] = useState<'tags' | 'natural'>('tags');
  const [taggerModel, setTaggerModel] = useState(WAIFU_MODEL_OPTIONS[0].id);
  const [naturalModel, setNaturalModel] = useState(NATURAL_MODEL_OPTIONS[0].id);
  const [naturalDevice, setNaturalDevice] = useState<'auto' | 'cpu' | 'cuda'>('auto');
  const [naturalMaxNewTokens, setNaturalMaxNewTokens] = useState(DEFAULT_CONCEPT_SETTINGS.naturalMaxNewTokens);
  const [generalThreshold, setGeneralThreshold] = useState(DEFAULT_CONCEPT_SETTINGS.generalThreshold);
  const [characterThreshold, setCharacterThreshold] = useState(DEFAULT_CONCEPT_SETTINGS.characterThreshold);
  const [ratingThreshold, setRatingThreshold] = useState(DEFAULT_CONCEPT_SETTINGS.ratingThreshold);
  const [maxTags, setMaxTags] = useState(DEFAULT_CONCEPT_SETTINGS.maxTags);
  const [generalMcutEnabled, setGeneralMcutEnabled] = useState(DEFAULT_CONCEPT_SETTINGS.generalMcutEnabled);
  const [characterMcutEnabled, setCharacterMcutEnabled] = useState(DEFAULT_CONCEPT_SETTINGS.characterMcutEnabled);
  const [includeGeneralTags, setIncludeGeneralTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeGeneralTags);
  const [includeCharacterTags, setIncludeCharacterTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeCharacterTags);
  const [includeCopyrightTags, setIncludeCopyrightTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeCopyrightTags);
  const [includeArtistTags, setIncludeArtistTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeArtistTags);
  const [includeMetaTags, setIncludeMetaTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeMetaTags);
  const [includeRatingTags, setIncludeRatingTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeRatingTags);
  const [conceptSettingsReadyKey, setConceptSettingsReadyKey] = useState('');
  const [autoTagging, setAutoTagging] = useState(false);
  const [preserveExistingCaptions, setPreserveExistingCaptions] = useState(true);
  const [replaceUnderscoresWithSpaces, setReplaceUnderscoresWithSpaces] = useState(false);
  const [archivingDataset, setArchivingDataset] = useState<string | null>(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [flaggedForDeletion, setFlaggedForDeletion] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const importDroppedImage = async (img: any) => {
    if (!selectedDataset || !selectedConcept) return;

    if (img?.kind === 'file' && img.file instanceof File) {
      const formData = new FormData();
      formData.append('dataset', selectedDataset);
      formData.append('concept', selectedConcept);
      formData.append('image', img.file, img.name || img.file.name || 'image.png');

      const response = await fetch('/api/datasets/import-uploaded-image', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to import dropped image');
      }
      return;
    }

    if (img?.kind === 'url' && typeof img.url === 'string') {
      const response = await fetch('/api/datasets/import-image-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: img.url,
          dataset: selectedDataset,
          concept: selectedConcept,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to import dropped image URL');
      }
      return;
    }

    const sourcePath = img.relativePath || img.path;
    if (!sourcePath) return;

    const response = await fetch('/api/datasets/import-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: sourcePath,
        dataset: selectedDataset,
        concept: selectedConcept,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Failed to import image');
    }
  };

  const importDroppedImages = async (droppedImages: any[]) => {
    if (!selectedDataset || !selectedConcept || droppedImages.length === 0) return;

    setIsImporting(true);
    try {
      for (const img of droppedImages) {
        await importDroppedImage(img);
      }
      await loadImages();
    } catch (err) {
      console.error('[DatasetsTab] Failed to import images:', err);
    } finally {
      setIsImporting(false);
      setNativeDropActive(false);
    }
  };

  const handleNativeDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!selectedDataset || !selectedConcept || !hasNativeImageDrop(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setNativeDropActive(true);
    return true;
  };

  const handleNativeDrop = async (e: DragEvent<HTMLDivElement>) => {
    if (!selectedDataset || !selectedConcept || !hasNativeImageDrop(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();

    const droppedImages = extractNativeDroppedImages(e.dataTransfer);
    await importDroppedImages(droppedImages);
    return true;
  };

  useEffect(() => {
    if ((showNewDataset || showNewConcept || renameDatasetTarget) && datasetError) {
      setCreateError(datasetError);
    }
  }, [datasetError, showNewDataset, showNewConcept, renameDatasetTarget]);

  // Droppable for receiving filmstrip images - COPY action
  const dropZoneResult = useDropZone({
    id: 'dataset-concept-drop',
    type: 'dataset-concept',
    actionType: 'copy',
    dataset: selectedDataset || undefined,
    concept: selectedConcept || undefined,
    onDrop: async (images: any[]) => {
      await importDroppedImages(images);
    },
    disabled: !selectedDataset || !selectedConcept,
  });

  const { setNodeRef: setDropRef, isOver, ...dropHandlers } = dropZoneResult;
  const selectedConceptSettingsKey = selectedDataset && selectedConcept
    ? `${selectedDataset}/${selectedConcept}`
    : '';

  const applyConceptSettings = (settings: Partial<DatasetConceptSettings> | null) => {
    const next = { ...DEFAULT_CONCEPT_SETTINGS, ...(settings || {}) };
    setTriggerTags(next.triggerTags || '');
    setPrependTags(next.prependTags || '');
    setCaptionMode(next.captionMode === 'natural' ? 'natural' : 'tags');
    setTaggerModel(next.modelRepo || DEFAULT_CONCEPT_SETTINGS.modelRepo);
    setNaturalModel(next.naturalModelRepo || DEFAULT_CONCEPT_SETTINGS.naturalModelRepo);
    setNaturalDevice(next.naturalDevice === 'cpu' || next.naturalDevice === 'cuda' ? next.naturalDevice : 'auto');
    setNaturalMaxNewTokens(Number.isFinite(Number(next.naturalMaxNewTokens))
      ? Math.max(32, Math.min(512, Math.floor(Number(next.naturalMaxNewTokens))))
      : DEFAULT_CONCEPT_SETTINGS.naturalMaxNewTokens);
    setGeneralThreshold(Number.isFinite(Number(next.generalThreshold)) ? Number(next.generalThreshold) : DEFAULT_CONCEPT_SETTINGS.generalThreshold);
    setCharacterThreshold(Number.isFinite(Number(next.characterThreshold)) ? Number(next.characterThreshold) : DEFAULT_CONCEPT_SETTINGS.characterThreshold);
    setRatingThreshold(Number.isFinite(Number(next.ratingThreshold)) ? Number(next.ratingThreshold) : DEFAULT_CONCEPT_SETTINGS.ratingThreshold);
    setMaxTags(Number.isFinite(Number(next.maxTags)) ? Math.max(1, Math.min(500, Math.floor(Number(next.maxTags)))) : DEFAULT_CONCEPT_SETTINGS.maxTags);
    setGeneralMcutEnabled(next.generalMcutEnabled === true);
    setCharacterMcutEnabled(next.characterMcutEnabled === true);
    setIncludeGeneralTags(next.includeGeneralTags !== false);
    setIncludeCharacterTags(next.includeCharacterTags !== false);
    setIncludeCopyrightTags(next.includeCopyrightTags === true);
    setIncludeArtistTags(next.includeArtistTags === true);
    setIncludeMetaTags(next.includeMetaTags === true);
    setIncludeRatingTags(next.includeRatingTags === true);
    setPreserveExistingCaptions(next.preserveExisting !== false);
    setReplaceUnderscoresWithSpaces(next.replaceUnderscoresWithSpaces === true);
  };

  // Load images when concept is selected
  useEffect(() => {
    if (selectedDataset && selectedConcept) {
      loadImages();
    } else {
      setImages([]);
      setSelectedImages(new Set());
      setFocusedImage(null);
    }
  }, [selectedDataset, selectedConcept]);

  useEffect(() => {
    let cancelled = false;
    setConceptSettingsReadyKey('');

    if (!selectedDataset || !selectedConcept) {
      applyConceptSettings(DEFAULT_CONCEPT_SETTINGS);
      return () => {
        cancelled = true;
      };
    }

    const key = `${selectedDataset}/${selectedConcept}`;
    void getConceptSettings(selectedDataset, selectedConcept).then((settings) => {
      if (cancelled) return;
      applyConceptSettings(settings || DEFAULT_CONCEPT_SETTINGS);
      setConceptSettingsReadyKey(key);
    });

    return () => {
      cancelled = true;
    };
  }, [getConceptSettings, selectedDataset, selectedConcept]);

  useEffect(() => {
    if (!selectedDataset || !selectedConcept || conceptSettingsReadyKey !== selectedConceptSettingsKey) return;

    const timeoutId = window.setTimeout(() => {
      void saveConceptSettings(selectedDataset, selectedConcept, {
        triggerTags,
        prependTags,
        captionMode,
        modelRepo: taggerModel,
        naturalModelRepo: naturalModel,
        naturalDevice,
        naturalMaxNewTokens,
        generalThreshold,
        characterThreshold,
        ratingThreshold,
        generalMcutEnabled,
        characterMcutEnabled,
        includeGeneralTags,
        includeCharacterTags,
        includeCopyrightTags,
        includeArtistTags,
        includeMetaTags,
        includeRatingTags,
        maxTags,
        preserveExisting: preserveExistingCaptions,
        replaceUnderscoresWithSpaces,
      });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    characterMcutEnabled,
    characterThreshold,
    captionMode,
    conceptSettingsReadyKey,
    generalMcutEnabled,
    generalThreshold,
    includeArtistTags,
    includeCharacterTags,
    includeCopyrightTags,
    includeGeneralTags,
    includeMetaTags,
    includeRatingTags,
    maxTags,
    naturalDevice,
    naturalMaxNewTokens,
    naturalModel,
    prependTags,
    preserveExistingCaptions,
    ratingThreshold,
    replaceUnderscoresWithSpaces,
    saveConceptSettings,
    selectedConcept,
    selectedConceptSettingsKey,
    selectedDataset,
    taggerModel,
    triggerTags,
  ]);

  const loadImages = async () => {
    if (!selectedDataset || !selectedConcept) return;

    setIsLoadingImages(true);
    const imgs = await getConceptImages(selectedDataset, selectedConcept);
    setImages(imgs);
    setIsLoadingImages(false);
  };

  // Handlers
  const handleCreateDataset = async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    setIsCreating(true);
    const created = await createDataset(newName.trim());
    setIsCreating(false);
    if (!created) {
      setCreateError(datasetError || 'Failed to create dataset');
      return;
    }
    setNewName('');
    setShowNewDataset(false);
  };

  const handleCreateConcept = async () => {
    if (!showNewConcept || !newName.trim()) return;
    setCreateError(null);
    setIsCreating(true);
    const created = await createConcept(showNewConcept, newName.trim(), newRepeats, isReg);
    setIsCreating(false);
    if (!created) {
      setCreateError(datasetError || 'Failed to create concept');
      return;
    }
    setNewName('');
    setNewRepeats(10);
    setIsReg(false);
    setShowNewConcept(null);
  };

  const openRenameDataset = (name: string) => {
    setCreateError(null);
    setRenameDatasetTarget(name);
    setRenameValue(name);
  };

  const handleRenameDataset = async () => {
    if (!renameDatasetTarget || !renameValue.trim()) return;
    const nextName = renameValue.trim();
    if (nextName === renameDatasetTarget) {
      setRenameDatasetTarget(null);
      setRenameValue('');
      return;
    }
    setCreateError(null);
    setIsCreating(true);
    const renamed = await renameDataset(renameDatasetTarget, nextName);
    setIsCreating(false);
    if (!renamed) {
      setCreateError(datasetError || 'Failed to rename dataset');
      return;
    }
    if (selectedDataset === renameDatasetTarget) {
      setSelectedDataset(nextName);
    }
    setRenameDatasetTarget(null);
    setRenameValue('');
  };

  const handleDeleteSelected = async () => {
    if (!selectedDataset || !selectedConcept || selectedImages.size === 0) return;

    if (!confirm(`Delete ${selectedImages.size} images?`)) return;

    await deleteImages(selectedDataset, selectedConcept, Array.from(selectedImages));
    await loadImages();
    setSelectedImages(new Set());
    setFocusedImage(null);
  };

  const handleMoveSelected = async () => {
    if (!selectedDataset || !selectedConcept || !moveToConcept || selectedImages.size === 0) return;

    await moveImages(selectedDataset, Array.from(selectedImages), selectedConcept, moveToConcept);
    await loadImages();
    setSelectedImages(new Set());
    setShowMoveModal(false);
    setMoveToConcept('');
  };

  const handleSaveCaption = async (imageName: string, caption: string): Promise<boolean> => {
    if (!selectedDataset || !selectedConcept) return false;
    const success = await saveCaption(selectedDataset, selectedConcept, imageName, caption);
    if (success) {
      // Update local state
      setImages(prev => prev.map(img =>
        img.filename === imageName ? { ...img, caption } : img
      ));
      if (focusedImage?.filename === imageName) {
        setFocusedImage({ ...focusedImage, caption });
      }
    }
    return success;
  };

  const handleBatchCaption = async (autoTag: boolean) => {
    if (!selectedDataset || !selectedConcept || images.length === 0 || autoTagging) return;

    const targetImages = selectedImages.size > 0 ? Array.from(selectedImages) : [];
    if (!autoTag && !triggerTags.trim() && !prependTags.trim()) {
      showToast('Add trigger words or prepend tags first', 'error');
      return;
    }

    setAutoTagging(true);
    try {
      const response = await fetch('/api/datasets/auto-tag-captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: selectedDataset,
          concept: selectedConcept,
          images: targetImages,
          triggerTags,
          prependTags,
          autoTag,
          captionMode,
          modelRepo: taggerModel,
          naturalModelRepo: naturalModel,
          naturalDevice,
          naturalMaxNewTokens,
          generalThreshold,
          characterThreshold,
          ratingThreshold,
          generalMcutEnabled,
          characterMcutEnabled,
          includeGeneralTags,
          includeCharacterTags,
          includeCopyrightTags,
          includeArtistTags,
          includeMetaTags,
          includeRatingTags,
          maxTags,
          preserveExisting: preserveExistingCaptions,
          replaceUnderscoresWithSpaces,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        error?: string;
        updated?: number;
        failed?: number;
        results?: Array<{ filename: string; success: boolean; caption?: string }>;
      } | null;
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || `Caption update failed (${response.status})`);
      }

      const captionByName = new Map(
        (payload?.results || [])
          .filter((entry) => entry.success && typeof entry.caption === 'string')
          .map((entry) => [entry.filename, entry.caption || ''])
      );
      if (captionByName.size > 0) {
        setImages(prev => prev.map(img => (
          captionByName.has(img.filename)
            ? {
              ...img,
              caption: captionByName.get(img.filename) || '',
              tags: (captionByName.get(img.filename) || '').split(',').map(tag => tag.trim()).filter(Boolean),
            }
            : img
        )));
        setFocusedImage(prev => prev && captionByName.has(prev.filename)
          ? {
            ...prev,
            caption: captionByName.get(prev.filename) || '',
            tags: (captionByName.get(prev.filename) || '').split(',').map(tag => tag.trim()).filter(Boolean),
          }
          : prev
        );
      } else {
        await loadImages();
      }

      const updated = payload?.updated || 0;
      const failed = payload?.failed || 0;
      showToast(
        failed > 0 ? `Updated ${updated} caption${updated === 1 ? '' : 's'}, ${failed} failed` : `Updated ${updated} caption${updated === 1 ? '' : 's'}`,
        failed > 0 ? 'error' : 'success'
      );
    } catch (error: any) {
      showToast(error?.message || 'Caption update failed', 'error');
    } finally {
      setAutoTagging(false);
    }
  };

  // Selection helpers
  const toggleImageSelect = (filename: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedImages(new Set(images.map(i => i.filename)));
  const selectNone = () => setSelectedImages(new Set());

  // Lightbox handlers
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const toggleFlag = (filename: string) => {
    setFlaggedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (!selectedDataset || !selectedConcept) return;
    await deleteImages(selectedDataset, selectedConcept, Array.from(flaggedForDeletion));
    await loadImages();
    setFlaggedForDeletion(new Set());
    setShowDeleteConfirm(false);
    setFocusedImage(null);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const clearFlags = () => {
    setFlaggedForDeletion(new Set());
  };

  // Get current dataset concepts for move dropdown
  const currentDataset = datasets.find(d => d.name === selectedDataset);
  const otherConcepts = currentDataset?.concepts.filter(c => {
    const folder = `${c.repeats}_${c.isReg ? 'reg_' : ''}${c.name}`;
    return folder !== selectedConcept;
  }) || [];
  const selectedConceptPath = currentDataset?.path && selectedConcept
    ? `${currentDataset.path.replace(/[\\/]+$/, '')}\\${selectedConcept}`
    : '';

  const copySelectedConceptPath = async () => {
    if (!selectedConceptPath) {
      showToast('Select a dataset concept first', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedConceptPath);
      showToast('Dataset path copied', 'success');
    } catch {
      showToast('Failed to copy dataset path', 'error');
    }
  };

  const openSelectedConceptPath = async () => {
    if (!selectedConceptPath) {
      showToast('Select a dataset concept first', 'error');
      return;
    }

    try {
      await showInFileExplorer(selectedConceptPath);
      showToast('Opened dataset path', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to open dataset path', 'error');
    }
  };

  const openDatasetArchivePath = async (archivePath: string) => {
    if (!archivePath) return;
    if (isUmbraRemoteClient()) {
      showToast('Opening ZIP paths is only available from the host PC', 'error');
      return;
    }
    try {
      await showInFileExplorer(archivePath);
      showToast('Opened dataset ZIP path', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to open dataset ZIP path', 'error');
    }
  };

  const createDatasetZip = async (datasetName: string) => {
    if (!datasetName || archivingDataset) return;
    setArchivingDataset(datasetName);
    try {
      const result = await archiveDataset(datasetName);
      const savings = result.compressionPercent > 0 ? `, ${result.compressionPercent}% smaller` : '';
      showToast(
        `Created ${datasetName}.zip (${result.fileCount} files, ${formatArchiveBytes(result.archiveBytes)}${savings})`,
        'success',
      );
      if (!isUmbraRemoteClient()) await openDatasetArchivePath(result.archivePath);
    } catch (error: any) {
      showToast(error?.message || 'Failed to create dataset ZIP', 'error');
    } finally {
      setArchivingDataset(null);
    }
  };

  return (
    <div className="h-full flex bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      {/* Left sidebar - Dataset tree */}
      <div className="glass-panel custom-scrollbar w-52 flex-shrink-0 overflow-y-auto rounded-none border-y-0 border-l-0">
        <DatasetTree
          datasets={datasets}
          selectedDataset={selectedDataset}
          selectedConcept={selectedConcept}
          onSelectDataset={(name) => {
            setSelectedDataset(name);
            setSelectedConcept(null);
          }}
          onSelectConcept={(dataset, concept) => {
            setSelectedDataset(dataset);
            setSelectedConcept(concept);
          }}
          onCreateDataset={() => { setCreateError(null); setShowNewDataset(true); }}
          onCreateConcept={(dataset) => { setCreateError(null); setShowNewConcept(dataset); }}
          onArchiveDataset={(dataset) => { void createDatasetZip(dataset); }}
          onOpenDatasetArchive={(archivePath) => { void openDatasetArchivePath(archivePath); }}
          onRenameDataset={openRenameDataset}
          onDeleteDataset={async (name) => {
            if (confirm(`Delete dataset "${name}" and all its contents?`)) {
              await deleteDataset(name);
              if (selectedDataset === name) {
                setSelectedDataset(null);
                setSelectedConcept(null);
              }
            }
          }}
          onDeleteConcept={async (dataset, concept) => {
            if (confirm(`Delete concept folder "${concept}"?`)) {
              await deleteConcept(dataset, concept);
              if (selectedConcept === concept) {
                setSelectedConcept(null);
              }
            }
          }}
          archivingDataset={archivingDataset}
        />
      </div>

      {/* Center - Image grid */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="glass-panel flex-shrink-0 flex items-center justify-between rounded-none border-x-0 border-t-0 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
              {selectedConcept ? (
                <>
                  {images.length} images
                  {selectedImages.size > 0 && (
                    <span className="ml-2 text-cyan-300">
                      ({selectedImages.size} selected)
                    </span>
                  )}
                </>
              ) : (
                'Select a concept folder'
              )}
            </span>
          </div>

          {selectedConcept && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => selectedDataset && void createDatasetZip(selectedDataset)}
                disabled={!selectedDataset || Boolean(archivingDataset)}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                title={currentDataset?.archive ? 'Rebuild the complete dataset ZIP' : 'Create a compressed ZIP of the complete dataset'}
              >
                {archivingDataset === selectedDataset
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Archive className="h-3.5 w-3.5" />}
                {currentDataset?.archive ? 'Rebuild ZIP' : 'Create ZIP'}
              </button>
              {currentDataset?.archive?.path && !isUmbraRemoteClient() ? (
                <button
                  onClick={() => void openDatasetArchivePath(currentDataset.archive!.path)}
                  className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                  title={`${currentDataset.archive.path} (${formatArchiveBytes(currentDataset.archive.size)})`}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Open ZIP
                </button>
              ) : null}

              <div className="h-4 w-px bg-white/10" />

              <button
                onClick={selectAll}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                All
              </button>
              <button
                onClick={selectNone}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                None
              </button>

              <button
                onClick={() => void copySelectedConceptPath()}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                title={selectedConceptPath || 'Copy dataset concept path'}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Path
              </button>
              <button
                onClick={() => void openSelectedConceptPath()}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                title={selectedConceptPath || 'Open dataset concept path'}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Open Path
              </button>

              <div className="h-4 w-px bg-white/10" />

              <button
                onClick={handleDeleteSelected}
                disabled={selectedImages.size === 0}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>

              <button
                onClick={() => setShowMoveModal(true)}
                disabled={selectedImages.size === 0 || otherConcepts.length === 0}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Move className="w-3.5 h-3.5" />
                Move
              </button>

              {/* Delete Flagged button - only shows when images are flagged */}
              {flaggedForDeletion.size > 0 && (
                <>
                  <div className="h-4 w-px bg-white/10" />
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/12 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Delete Flagged ({flaggedForDeletion.size})
                  </button>
                  <button
                    onClick={clearFlags}
                    className="umbra-icon-button rounded p-1 text-xs transition-colors"
                    title="Clear all flags"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {selectedConcept && (
          <div className="glass-panel flex-shrink-0 rounded-none border-x-0 border-t-0 px-3 py-2">
            <div className="grid grid-cols-1 items-end gap-2 xl:grid-cols-2 2xl:grid-cols-[minmax(210px,1fr)_minmax(260px,1.25fr)_220px]">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  Concept Trigger
                </span>
                <textarea
                  value={triggerTags}
                  onChange={(e) => setTriggerTags(e.target.value)}
                  placeholder="unique token for this concept..."
                  rows={3}
                  className="umbra-input min-h-20 w-full resize-none rounded px-2 py-2 text-xs leading-relaxed placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  Prepend Tags
                </span>
                <textarea
                  value={prependTags}
                  onChange={(e) => setPrependTags(e.target.value)}
                  placeholder="best quality, style tags..."
                  rows={3}
                  className="umbra-input min-h-20 w-full resize-none rounded px-2 py-2 text-xs leading-relaxed placeholder:text-zinc-600 focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <div className="min-w-0 space-y-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setCaptionMode('tags')}
                    className={`h-7 rounded border text-[10px] font-bold uppercase tracking-[0.12em] ${captionMode === 'tags' ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100' : 'border-white/10 text-zinc-500'}`}
                  >
                    Tag list
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptionMode('natural')}
                    className={`h-7 rounded border text-[10px] font-bold uppercase tracking-[0.12em] ${captionMode === 'natural' ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100' : 'border-white/10 text-zinc-500'}`}
                  >
                    Natural
                  </button>
                </div>
                <select
                  value={captionMode === 'natural' ? naturalModel : taggerModel}
                  onChange={(e) => captionMode === 'natural' ? setNaturalModel(e.target.value) : setTaggerModel(e.target.value)}
                  className="umbra-input h-8 w-full rounded px-2 text-xs focus:border-cyan-400/60 focus:outline-none"
                  title="Caption model"
                >
                  {(captionMode === 'natural' ? NATURAL_MODEL_OPTIONS : WAIFU_MODEL_OPTIONS).map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-full flex flex-wrap items-center justify-end gap-2">
                <label className="flex h-8 items-center gap-1.5 rounded border border-white/10 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={preserveExistingCaptions}
                    onChange={(e) => setPreserveExistingCaptions(e.target.checked)}
                    className="h-3 w-3"
                    style={{ accentColor: 'var(--umbra-accent)' }}
                  />
                  Keep old
                </label>
                <label className="flex h-8 items-center gap-1.5 rounded border border-white/10 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                  <input
                    type="checkbox"
                    checked={replaceUnderscoresWithSpaces}
                    onChange={(e) => setReplaceUnderscoresWithSpaces(e.target.checked)}
                    disabled={captionMode === 'natural'}
                    className="h-3 w-3"
                    style={{ accentColor: 'var(--umbra-accent)' }}
                  />
                  Use spaces
                </label>
                <button
                  onClick={() => void handleBatchCaption(false)}
                  disabled={autoTagging || images.length === 0}
                  className="umbra-icon-button h-8 rounded px-2 text-xs font-bold uppercase tracking-[0.12em] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Apply trigger/prepend text without running the selected caption model"
                >
                  Apply
                </button>
                <button
                  onClick={() => void handleBatchCaption(true)}
                  disabled={autoTagging || images.length === 0}
                  className="flex h-8 items-center gap-1.5 rounded border border-cyan-400/35 bg-cyan-500/15 px-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:bg-cyan-500/22 disabled:cursor-not-allowed disabled:opacity-50"
                  title={captionMode === 'natural' ? 'Write local natural-language captions' : 'Run WD tagger and write tag captions'}
                >
                  {autoTagging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {selectedImages.size > 0
                    ? `${captionMode === 'natural' ? 'Caption' : 'Tag'} ${selectedImages.size}`
                    : captionMode === 'natural' ? 'Caption All' : 'Tag All'}
                </button>
              </div>
            </div>
            <div className={`${captionMode === 'tags' ? 'grid' : 'hidden'} mt-2 grid-cols-[repeat(6,minmax(90px,1fr))_auto_auto] items-end gap-2`}>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  General
                </span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={generalThreshold}
                  onChange={(e) => setGeneralThreshold(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                  className="umbra-input h-8 w-full rounded px-2 text-xs focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  Character
                </span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={characterThreshold}
                  onChange={(e) => setCharacterThreshold(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                  className="umbra-input h-8 w-full rounded px-2 text-xs focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  Rating
                </span>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={ratingThreshold}
                  onChange={(e) => setRatingThreshold(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
                  className="umbra-input h-8 w-full rounded px-2 text-xs focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                  Max Tags
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={maxTags}
                  onChange={(e) => setMaxTags(Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 1))))}
                  className="umbra-input h-8 w-full rounded px-2 text-xs focus:border-cyan-400/60 focus:outline-none"
                />
              </label>
              <label className="flex h-8 items-center gap-1.5 rounded border border-white/10 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                <input
                  type="checkbox"
                  checked={generalMcutEnabled}
                  onChange={(e) => setGeneralMcutEnabled(e.target.checked)}
                  className="h-3 w-3"
                  style={{ accentColor: 'var(--umbra-accent)' }}
                />
                General MCut
              </label>
              <label className="flex h-8 items-center gap-1.5 rounded border border-white/10 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                <input
                  type="checkbox"
                  checked={characterMcutEnabled}
                  onChange={(e) => setCharacterMcutEnabled(e.target.checked)}
                  className="h-3 w-3"
                  style={{ accentColor: 'var(--umbra-accent)' }}
                />
                Character MCut
              </label>
              <div className="h-8 min-w-[120px] rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <span className="block text-[9px] text-zinc-600">Scope</span>
                <span className="block truncate font-bold text-zinc-300">{selectedConcept}</span>
              </div>
              <div className="h-8 min-w-[120px] rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                <span className="block text-[9px] text-zinc-600">Saved</span>
                <span className="block font-bold text-zinc-300">{conceptSettingsReadyKey === selectedConceptSettingsKey ? 'Concept local' : 'Loading'}</span>
              </div>
            </div>
            <div className={`${captionMode === 'tags' ? 'flex' : 'hidden'} mt-2 flex-wrap items-center gap-2`}>
              <span className="mr-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                Tag Categories
              </span>
              {[
                ['General', includeGeneralTags, setIncludeGeneralTags],
                ['Character', includeCharacterTags, setIncludeCharacterTags],
                ['Copyright', includeCopyrightTags, setIncludeCopyrightTags],
                ['Artist', includeArtistTags, setIncludeArtistTags],
                ['Meta', includeMetaTags, setIncludeMetaTags],
                ['Rating', includeRatingTags, setIncludeRatingTags],
              ].map(([label, checked, setter]) => (
                <label
                  key={String(label)}
                  className={`flex h-8 items-center gap-1.5 rounded border px-2 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    checked
                      ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                      : 'border-white/10 text-zinc-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)}
                    className="h-3 w-3"
                    style={{ accentColor: 'var(--umbra-accent)' }}
                  />
                  {String(label)}
                </label>
              ))}
            </div>
            {captionMode === 'natural' && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded border border-cyan-400/15 bg-cyan-500/5 p-2">
                <label className="w-32">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Device</span>
                  <select
                    value={naturalDevice}
                    onChange={(e) => setNaturalDevice(e.target.value as 'auto' | 'cpu' | 'cuda')}
                    className="umbra-input h-8 w-full rounded px-2 text-xs"
                  >
                    <option value="auto">Auto</option>
                    <option value="cuda">GPU</option>
                    <option value="cpu">CPU</option>
                  </select>
                </label>
                <label className="w-32">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Max tokens</span>
                  <input
                    type="number"
                    min={32}
                    max={512}
                    step={8}
                    value={naturalMaxNewTokens}
                    onChange={(e) => setNaturalMaxNewTokens(Math.max(32, Math.min(512, Math.floor(Number(e.target.value) || 32))))}
                    className="umbra-input h-8 w-full rounded px-2 text-xs"
                  />
                </label>
                <p className="min-w-64 flex-1 text-[10px] leading-relaxed text-zinc-500">
                  Runs locally and writes factual prose captions, including explicit content. The model loads once for the selected batch.
                </p>
                <div className="h-8 min-w-[120px] rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  <span className="block text-[9px] text-zinc-600">Saved</span>
                  <span className="block font-bold text-zinc-300">Concept local</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Image grid - droppable */}
        <div
          ref={setDropRef}
          {...dropHandlers}
          onDragOver={(e) => {
            if (!handleNativeDragOver(e)) {
              dropHandlers.onDragOver(e);
            }
          }}
          onDragEnter={(e) => {
            if (!handleNativeDragOver(e)) {
              dropHandlers.onDragEnter(e);
            }
          }}
          onDragLeave={(e) => {
            setNativeDropActive(false);
            dropHandlers.onDragLeave(e);
          }}
          onDrop={async (e) => {
            if (!(await handleNativeDrop(e))) {
              await dropHandlers.onDrop(e);
            }
          }}
          className={`custom-scrollbar relative flex-1 overflow-y-auto p-3 transition-colors ${isOver || nativeDropActive ? 'bg-cyan-500/10' : ''}`}
        >
          {/* Drop overlay */}
          {(isOver || nativeDropActive) && selectedConcept && (
            <div className="absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-cyan-400/70 bg-cyan-500/15 backdrop-blur-sm pointer-events-none">
              <div className="text-center">
                <Upload className="mx-auto mb-2 h-12 w-12 animate-bounce text-cyan-300" />
                <p className="font-bold text-cyan-100">Drop images here</p>
                <p className="text-sm text-cyan-300">to add to {selectedConcept}</p>
              </div>
            </div>
          )}

          {/* Importing overlay */}
          {isImporting && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-cyan-300" />
                <p className="text-white font-medium">Importing images...</p>
              </div>
            </div>
          )}

          {isLoadingImages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
            </div>
          ) : !selectedConcept ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <p>Select a concept folder, then drag images from filmstrip</p>
            </div>
          ) : images.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <p>No images - drag from filmstrip or download from Search</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {images.map((img, index) => {
                const imageUrl = `/api/files/datasets/${selectedDataset}/${selectedConcept}/${img.filename}`;
                const isSelected = selectedImages.has(img.filename);
                const isFocused = focusedImage?.filename === img.filename;
                const isFlagged = flaggedForDeletion.has(img.filename);

                return (
                  <div
                    key={img.filename}
                    className={`relative aspect-square rounded overflow-hidden bg-zinc-800
                               border cursor-pointer transition-all
                               ${isFlagged ? 'ring-2 ring-red-500' : ''}
                               ${isFocused ? 'border-cyan-400 ring-1 ring-cyan-400/30' :
                                 isSelected ? 'border-cyan-300' : 'border-white/10 hover:border-white/25'}`}
                    onClick={() => setFocusedImage(img)}
                    onDoubleClick={() => openLightbox(index)}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleImageSelect(img.filename);
                      }}
                      className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center
                                 ${isSelected ? 'border-cyan-300/70 bg-cyan-500/30' : 'border-white/20 bg-black/65'}`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-cyan-50" />}
                    </button>

                    {/* Flag indicator */}
                    {isFlagged && (
                      <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded bg-red-500 flex items-center justify-center">
                        <Trash2 className="w-3 h-3 text-white" />
                      </div>
                    )}

                    <img
                      src={imageUrl}
                      alt={img.filename}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />

                    {/* Caption indicator */}
                    {img.caption && (
                      <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                        <Tag className="w-3 h-3 text-green-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar - Caption editor */}
      <div className="glass-panel w-72 flex-shrink-0 rounded-none border-y-0 border-r-0">
        <CaptionEditor
          image={focusedImage}
          datasetName={selectedDataset || ''}
          conceptFolder={selectedConcept || ''}
          onSave={handleSaveCaption}
        />
      </div>

      {/* Modals */}
      {/* New Dataset Modal */}
      {showNewDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-80 border-white/10 p-4">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-200">Create Dataset</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Dataset name..."
              autoFocus
              className="umbra-input w-full rounded px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateDataset()}
            />
            {createError && (
              <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowNewDataset(false); setNewName(''); setCreateError(null); }}
                disabled={isCreating}
                className="umbra-icon-button rounded px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDataset}
                disabled={!newName.trim() || isCreating}
                className="rounded border border-cyan-400/35 bg-cyan-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/22
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dataset Modal */}
      {renameDatasetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-80 border-white/10 p-4">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-200">Rename Dataset</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Dataset name..."
              autoFocus
              className="umbra-input w-full rounded px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleRenameDataset()}
            />
            {createError && (
              <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setRenameDatasetTarget(null); setRenameValue(''); setCreateError(null); }}
                disabled={isCreating}
                className="umbra-icon-button rounded px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameDataset}
                disabled={!renameValue.trim() || isCreating}
                className="rounded border border-cyan-400/35 bg-cyan-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/22
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Concept Modal */}
      {showNewConcept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-80 border-white/10 p-4">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-200">Create Concept</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Concept name..."
                autoFocus
                className="umbra-input w-full rounded px-3 py-2 text-sm placeholder:text-zinc-500 focus:border-cyan-400/60 focus:outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateConcept()}
              />
              <div className="flex items-center gap-3">
                <label className="text-sm text-zinc-400">Repeats:</label>
                <input
                  type="number"
                  value={newRepeats}
                  onChange={(e) => setNewRepeats(parseInt(e.target.value) || 1)}
                  min={1}
                  className="umbra-input w-20 rounded px-2 py-1 text-white"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isReg}
                  onChange={(e) => setIsReg(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                  style={{ accentColor: 'var(--umbra-accent)' }}
                />
                <span className="text-sm text-zinc-300">Regularization images</span>
              </label>
            </div>
            <p className="text-xs text-zinc-500 mt-3">
              Folder: {newRepeats}_{isReg ? 'reg_' : ''}{newName || 'name'}
            </p>
            {createError && (
              <p className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowNewConcept(null); setNewName(''); setNewRepeats(10); setIsReg(false); setCreateError(null); }}
                disabled={isCreating}
                className="umbra-icon-button rounded px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateConcept}
                disabled={!newName.trim() || isCreating}
                className="rounded border border-cyan-400/35 bg-cyan-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/22
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-80 border-white/10 p-4">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-200">Move {selectedImages.size} Images</h3>
            <select
              value={moveToConcept}
              onChange={(e) => setMoveToConcept(e.target.value)}
              className="umbra-input w-full rounded px-3 py-2 text-white focus:border-cyan-400/60 focus:outline-none"
            >
              <option value="">Select concept...</option>
              {otherConcepts.map(c => {
                const folder = `${c.repeats}_${c.isReg ? 'reg_' : ''}${c.name}`;
                return (
                  <option key={folder} value={folder}>{folder}</option>
                );
              })}
            </select>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowMoveModal(false); setMoveToConcept(''); }}
                className="umbra-icon-button rounded px-4 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleMoveSelected}
                disabled={!moveToConcept}
                className="rounded border border-cyan-400/35 bg-cyan-500/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/22
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dataset Lightbox */}
      {lightboxOpen && images.length > 0 && selectedDataset && selectedConcept && (
        <DatasetLightbox
          images={images}
          initialIndex={lightboxIndex}
          datasetName={selectedDataset}
          conceptFolder={selectedConcept}
          flaggedForDeletion={flaggedForDeletion}
          onToggleFlag={toggleFlag}
          onClose={() => setLightboxOpen(false)}
          onSaveCaption={handleSaveCaption}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedDataset && selectedConcept && (
        <DeleteConfirmModal
          images={images.filter(img => flaggedForDeletion.has(img.filename))}
          datasetName={selectedDataset}
          conceptFolder={selectedConcept}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
}
