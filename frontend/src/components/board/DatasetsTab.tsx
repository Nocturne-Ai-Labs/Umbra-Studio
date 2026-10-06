import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { useI18n } from '@/i18n';
import { useState, useEffect, useMemo, useRef, type DragEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { Archive, Trash2, Move, Tag, Check, CheckSquare, Square, Loader2, Upload, X, Flag, Sparkles, Copy, FolderOpen, Search, ChevronRight, ChevronDown, SlidersHorizontal, RefreshCw, ArrowUpAZ, ArrowDownAZ, PanelRight, FolderTree, ZoomIn, MoreHorizontal } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { useStore } from '@/store/useStore';
import { useDropZone } from '@/lib/dnd';
import type { DroppedImage } from '@/lib/dnd/SimpleDragDrop';
import { showInFileExplorer } from '@/utils/fileExplorer';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { DatasetTree } from './components/DatasetTree';
import { CaptionEditor } from './components/CaptionEditor';
import { DatasetLightbox } from './components/DatasetLightbox';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { useDatasets } from './hooks/useDatasets';
import type { DatasetConceptSettings } from './hooks/useDatasets';
import type { DatasetImage } from './types';
import { redownloadDatasetImage } from './datasetMedia';
import { DatasetRedownloadButton } from './components/DatasetRedownloadButton';
import { DatasetThumbnail } from './components/DatasetThumbnail';
import { createConceptSettingsSession, type ConceptSaveStatus } from './conceptSettingsSession';
import { browseDatasetImages, selectDatasetImageRange, type DatasetCaptionFilter, type DatasetImageSort } from './datasetBrowse';

const IMAGE_FILE_PATTERN = /\.(avif|bmp|gif|jpe?g|png|webp)$/i;
const DATASET_IMAGE_PAGE_SIZE = 120;
const WAIFU_MODEL_OPTIONS = [
  { id: 'SmilingWolf/wd-vit-tagger-v3', label: 'wd-vit' },
  { id: 'SmilingWolf/wd-convnext-tagger-v3', label: 'wd-convnext' },
  { id: 'SmilingWolf/wd-eva02-large-tagger-v3', label: 'wd-eva02' },
  { id: 'SmilingWolf/wd-swinv2-tagger-v3', label: 'wd-swinv2' },
  { id: 'pixai-labs/pixai-tagger-v1.0', label: 'PixAI Tagger v1.0' },
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
  includeStyleTags: true,
  includeCharacterTags: true,
  includeCopyrightTags: false,
  includeArtistTags: false,
  includeMetaTags: false,
  includeRatingTags: false,
  maxTags: 120,
  preserveExisting: false,
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

function extractNativeDroppedImages(dataTransfer: DataTransfer): DroppedImage[] {
  const images: DroppedImage[] = Array.from(dataTransfer.files || [])
    .filter(isNativeImageFile)
    .map((file): DroppedImage => ({ kind: 'file', file, name: file.name, type: file.type }));

  const url = getDroppedImageUrl(dataTransfer);
  if (url) {
    images.push({ kind: 'url', url });
  }

  return images;
}

export function DatasetsTab() {
  const { t } = useI18n();
  const { showToast } = useStore();
  const {
    datasets,
    isLoading: isLoadingDatasets,
    fetchDatasets,
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
  const [visibleImageCount, setVisibleImageCount] = useState(DATASET_IMAGE_PAGE_SIZE);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [focusedImage, setFocusedImage] = useState<DatasetImage | null>(null);
  const [imageQuery, setImageQuery] = useState('');
  const [captionFilter, setCaptionFilter] = useState<DatasetCaptionFilter>('all');
  const [imageSort, setImageSort] = useState<DatasetImageSort>('source');
  const [sortDescending, setSortDescending] = useState(false);
  const [tagSettingsOpen, setTagSettingsOpen] = useState(false);
  const [folderRailOpen, setFolderRailOpen] = useState(() => window.innerWidth >= 1024);
  const [captionPaneOpen, setCaptionPaneOpen] = useState(() => window.innerWidth >= 1280);
  const [imageContextMenu, setImageContextMenu] = useState<{ x: number; y: number; filename: string } | null>(null);
  const selectionAnchor = useRef<string | null>(null);
  const browsedImages = useMemo(() => browseDatasetImages(images, imageQuery, captionFilter, imageSort, sortDescending), [images, imageQuery, captionFilter, imageSort, sortDescending]);
  const filteredSelectionCount = browsedImages.filter(image => selectedImages.has(image.filename)).length;
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [repairingImages, setRepairingImages] = useState<Set<string>>(new Set());
  const repairLocks = useRef(new Set<string>());
  const conceptKey = JSON.stringify([selectedDataset, selectedConcept]);
  const activeConcept = useRef(conceptKey);
  const imageLoadSequence = useRef(0);
  const imageScrollRef = useRef<HTMLDivElement | null>(null);
  activeConcept.current = conceptKey;
  const repairKey = (filename: string) => JSON.stringify([selectedDataset, selectedConcept, filename]);
  const handleRedownload = async (image: DatasetImage) => {
    if (!selectedDataset || !selectedConcept) return;
    const key = repairKey(image.filename);
    if (repairLocks.current.has(key)) return;
    repairLocks.current.add(key);
    setRepairingImages(previous => new Set(previous).add(key));
    try {
      const revision = await redownloadDatasetImage(selectedDataset, selectedConcept, image.filename);
      if (activeConcept.current === conceptKey) {
        setImages(previous => previous.map(item => item.filename === image.filename ? { ...item, revision } : item));
        setFocusedImage(previous => previous?.filename === image.filename ? { ...previous, revision } : previous);
      }
      showToast('Original image restored. Captions kept.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Image re-download failed.', 'error');
    } finally {
      repairLocks.current.delete(key);
      setRepairingImages(previous => { const next = new Set(previous); next.delete(key); return next; });
    }
  };

  // Modal states
  const [showNewConcept, setShowNewConcept] = useState(false);
  const [renameDatasetTarget, setRenameDatasetTarget] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRepeats, setNewRepeats] = useState(10);
  const [isReg, setIsReg] = useState(false);
  const [moveToConcept, setMoveToConcept] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const importInProgress = useRef(false);
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
  const [includeStyleTags, setIncludeStyleTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeStyleTags);
  const [includeCharacterTags, setIncludeCharacterTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeCharacterTags);
  const [includeCopyrightTags, setIncludeCopyrightTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeCopyrightTags);
  const [includeArtistTags, setIncludeArtistTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeArtistTags);
  const [includeMetaTags, setIncludeMetaTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeMetaTags);
  const [includeRatingTags, setIncludeRatingTags] = useState(DEFAULT_CONCEPT_SETTINGS.includeRatingTags);
  const [conceptSettingsReadyKey, setConceptSettingsReadyKey] = useState('');
  const [conceptSettingsFailed, setConceptSettingsFailed] = useState(false);
  const [conceptSettingsRetry, setConceptSettingsRetry] = useState(0);
  const conceptSessions = useRef(new Map<string, ReturnType<typeof createConceptSettingsSession>>());
  const [conceptSaveStatus, setConceptSaveStatus] = useState<ConceptSaveStatus>({ state: 'saved' });
  const [autoTagging, setAutoTagging] = useState(false);
  const [replaceUnderscoresWithSpaces, setReplaceUnderscoresWithSpaces] = useState(false);
  const [archivingDataset, setArchivingDataset] = useState<string | null>(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [flaggedForDeletion, setFlaggedForDeletion] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const importDroppedImage = async (img: any, dataset: string, concept: string) => {
    if (img?.kind === 'file' && img.file instanceof File) {
      const formData = new FormData();
      formData.append('dataset', dataset);
      formData.append('concept', concept);
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
          dataset,
          concept,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to import dropped image URL');
      }
      return;
    }

    const sourcePath = img.relativePath || img.path;
    if (!sourcePath) throw new Error('Dropped image has no source path');

    const response = await fetch('/api/datasets/import-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePath: sourcePath,
        dataset,
        concept,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Failed to import image');
    }
  };

  const importDroppedImages = async (droppedImages: any[]) => {
    if (!selectedDataset || !selectedConcept || droppedImages.length === 0 || importInProgress.current) return;

    const dataset = selectedDataset;
    const concept = selectedConcept;
    importInProgress.current = true;
    setIsImporting(true);
    try {
      let imported = 0;
      const failures: string[] = [];
      for (const img of droppedImages) {
        try {
          await importDroppedImage(img, dataset, concept);
          imported++;
        } catch (error) {
          failures.push(error instanceof Error ? error.message : 'Image import failed');
        }
      }
      const refreshed = await loadImages();
      if (refreshed === null && activeConcept.current === conceptKey) {
        showToast(`Imported ${imported} of ${droppedImages.length} images, but could not refresh the concept.`, 'error');
        return;
      }
      if (failures.length > 0) {
        showToast(`Imported ${imported} of ${droppedImages.length} images. ${failures[0]}`, 'error');
      } else {
        showToast(`Imported ${imported} image${imported === 1 ? '' : 's'} to ${concept}`, 'success');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not refresh imported images', 'error');
    } finally {
      importInProgress.current = false;
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
    if ((showNewConcept || renameDatasetTarget) && datasetError) {
      setCreateError(datasetError);
    }
  }, [datasetError, showNewConcept, renameDatasetTarget]);

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
    setIncludeStyleTags(next.includeStyleTags !== false);
    setIncludeCharacterTags(next.includeCharacterTags !== false);
    setIncludeCopyrightTags(next.includeCopyrightTags === true);
    setIncludeArtistTags(next.includeArtistTags === true);
    setIncludeMetaTags(next.includeMetaTags === true);
    setIncludeRatingTags(next.includeRatingTags === true);
    setReplaceUnderscoresWithSpaces(next.replaceUnderscoresWithSpaces === true);
  };

  // Load images when concept is selected
  useEffect(() => {
    if (imageScrollRef.current) imageScrollRef.current.scrollTop = 0;
    setImages([]);
    setImageLoadError(false);
    setVisibleImageCount(DATASET_IMAGE_PAGE_SIZE);
    setSelectedImages(new Set());
    selectionAnchor.current = null;
    setImageContextMenu(null);
    setFlaggedForDeletion(new Set());
    setFocusedImage(null);
    setLightboxOpen(false);
    setShowDeleteConfirm(false);
    setShowMoveModal(false);
    setMoveToConcept('');
    if (selectedDataset && selectedConcept) {
      void loadImages();
    } else {
      setIsLoadingImages(false);
    }
    return () => { imageLoadSequence.current++; };
  }, [selectedDataset, selectedConcept]);

  useEffect(() => {
    setVisibleImageCount(DATASET_IMAGE_PAGE_SIZE);
    if (imageScrollRef.current) imageScrollRef.current.scrollTop = 0;
  }, [imageQuery, captionFilter, imageSort, sortDescending]);

  useEffect(() => {
    let cancelled = false;
    setConceptSettingsReadyKey('');
    setConceptSettingsFailed(false);

    if (!selectedDataset || !selectedConcept) {
      applyConceptSettings(DEFAULT_CONCEPT_SETTINGS);
      return () => {
        cancelled = true;
      };
    }

    const key = `${selectedDataset}/${selectedConcept}`;
    const existing = conceptSessions.current.get(key);
    if (existing) {
      applyConceptSettings(existing.draft);
      setConceptSaveStatus(existing.status);
      setConceptSettingsReadyKey(key);
      return;
    }
    void getConceptSettings(selectedDataset, selectedConcept).then((settings) => {
      if (cancelled) return;
      if (!settings) {
        setConceptSettingsFailed(true);
        return;
      }
      applyConceptSettings(settings);
      const session = createConceptSettingsSession(
        { ...DEFAULT_CONCEPT_SETTINGS, ...settings },
        value => saveConceptSettings(selectedDataset, selectedConcept, value),
        status => { if (activeConcept.current === conceptKey) setConceptSaveStatus(status); },
      );
      conceptSessions.current.set(key, session);
      setConceptSaveStatus(session.status);
      setConceptSettingsReadyKey(key);
    });

    return () => {
      cancelled = true;
    };
  }, [getConceptSettings, saveConceptSettings, selectedDataset, selectedConcept, conceptSettingsRetry]);

  useEffect(() => () => {
    for (const session of conceptSessions.current.values()) void session.flush();
  }, []);

  useEffect(() => {
    if (!selectedDataset || !selectedConcept || conceptSettingsReadyKey !== selectedConceptSettingsKey) return;

    conceptSessions.current.get(selectedConceptSettingsKey)?.update({
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
        includeStyleTags,
        includeCharacterTags,
        includeCopyrightTags,
        includeArtistTags,
        includeMetaTags,
        includeRatingTags,
        maxTags,
        preserveExisting: false,
        replaceUnderscoresWithSpaces,
    });
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
    includeStyleTags,
    includeMetaTags,
    includeRatingTags,
    maxTags,
    naturalDevice,
    naturalMaxNewTokens,
    naturalModel,
    prependTags,
    ratingThreshold,
    replaceUnderscoresWithSpaces,
    saveConceptSettings,
    selectedConcept,
    selectedConceptSettingsKey,
    selectedDataset,
    taggerModel,
    triggerTags,
  ]);

  const loadImages = async (): Promise<DatasetImage[] | null> => {
    if (!selectedDataset || !selectedConcept || activeConcept.current !== conceptKey) return null;
    const sequence = ++imageLoadSequence.current;
    setIsLoadingImages(true);
    setImageLoadError(false);
    try {
      const imgs = await getConceptImages(selectedDataset, selectedConcept);
      if (activeConcept.current === conceptKey && sequence === imageLoadSequence.current) {
        if (imgs === null) setImageLoadError(true);
        else {
          setImages(imgs);
          const currentNames = new Set(imgs.map(image => image.filename));
          setSelectedImages(previous => new Set([...previous].filter(name => currentNames.has(name))));
          setFlaggedForDeletion(previous => new Set([...previous].filter(name => currentNames.has(name))));
          setFocusedImage(previous => previous ? imgs.find(image => image.filename === previous.filename) || null : null);
          return imgs;
        }
      }
    } finally {
      if (activeConcept.current === conceptKey && sequence === imageLoadSequence.current) setIsLoadingImages(false);
    }
    return null;
  };

  const refreshAfterFailedDelete = async () => {
    const current = await loadImages();
    if (!current) return;
    const remaining = new Set(current.map(image => image.filename));
    setSelectedImages(previous => new Set([...previous].filter(name => remaining.has(name))));
    setFlaggedForDeletion(previous => new Set([...previous].filter(name => remaining.has(name))));
    setFocusedImage(previous => previous && remaining.has(previous.filename) ? previous : null);
  };

  // Handlers
  const handleCreateConcept = async () => {
    if (!showNewConcept || !newName.trim()) return;
    setCreateError(null);
    setIsCreating(true);
    const created = await createConcept(newName.trim(), newRepeats, isReg);
    setIsCreating(false);
    if (!created) {
      setCreateError(datasetError || 'Failed to create concept');
      return;
    }
    setNewName('');
    setNewRepeats(10);
    setIsReg(false);
    setShowNewConcept(false);
    setSelectedDataset(created);
    setSelectedConcept(created);
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
    const sessions = [...conceptSessions.current.entries()]
      .filter(([key]) => key.startsWith(`${renameDatasetTarget}/`));
    for (const [, session] of sessions) {
      if (!await session.flush()) {
        setIsCreating(false);
        setCreateError('Save concept settings before renaming this dataset.');
        return;
      }
    }
    const renamed = await renameDataset(renameDatasetTarget, nextName);
    setIsCreating(false);
    if (!renamed) {
      setCreateError(datasetError || 'Failed to rename dataset');
      return;
    }
    if (selectedDataset === renameDatasetTarget) {
      setSelectedDataset(renamed);
    }
    for (const [key] of sessions) conceptSessions.current.delete(key);
    setRenameDatasetTarget(null);
    setRenameValue('');
  };

  const handleDeleteSelected = async () => {
    if (!selectedDataset || !selectedConcept || selectedImages.size === 0) return;

    if (!confirm(`Delete ${selectedImages.size} images?`)) return;

    const result = await deleteImages(selectedDataset, selectedConcept, Array.from(selectedImages));
    if (!result.success) {
      await refreshAfterFailedDelete();
      showToast(result.error, 'error');
      return;
    }
    if (activeConcept.current !== conceptKey) return;
    await loadImages();
    if (activeConcept.current !== conceptKey) return;
    setSelectedImages(new Set());
    setFocusedImage(null);
  };

  const handleMoveSelected = async () => {
    if (!selectedDataset || !selectedConcept || !moveToConcept || selectedImages.size === 0) return;

    const destination = otherConcepts.find(concept => JSON.stringify([concept.datasetName, concept.folder]) === moveToConcept);
    if (!destination) return;
    const result = await moveImages(selectedDataset, Array.from(selectedImages), selectedConcept, destination.datasetName, destination.folder);
    if (!result.success) {
      showToast(result.error, 'error');
      return;
    }
    if (activeConcept.current !== conceptKey) return;
    await loadImages();
    if (activeConcept.current !== conceptKey) return;
    setSelectedImages(new Set());
    setShowMoveModal(false);
    setMoveToConcept('');
  };

  const handleSaveCaption = async (imageName: string, caption: string): Promise<boolean> => {
    if (!selectedDataset || !selectedConcept) return false;
    const success = await saveCaption(selectedDataset, selectedConcept, imageName, caption);
    if (success && activeConcept.current === conceptKey) {
      // Update local state
      const tags = caption.split(',').map(tag => tag.trim()).filter(Boolean);
      setImages(prev => prev.map(img =>
        img.filename === imageName ? { ...img, caption, tags } : img
      ));
      setFocusedImage(previous => previous?.filename === imageName ? { ...previous, caption, tags } : previous);
    }
    return success;
  };

  const handleBatchCaption = async (autoTag: boolean) => {
    if (!selectedDataset || !selectedConcept || images.length === 0 || autoTagging || conceptSettingsReadyKey !== selectedConceptSettingsKey) return;

    const targetImages = selectedImages.size > 0 ? Array.from(selectedImages) : [];
    if (!autoTag && !triggerTags.trim() && !prependTags.trim()) {
      showToast('Add trigger words or prepend tags first', 'error');
      return;
    }

    setAutoTagging(true);
    try {
      const session = conceptSessions.current.get(selectedConceptSettingsKey);
      if (!session || !await session.flush()) throw new Error('Save concept settings before captioning.');
      if (activeConcept.current !== conceptKey) return;
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
          persistSettings: false,
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
          includeStyleTags,
          includeCharacterTags,
          includeCopyrightTags,
          includeArtistTags,
          includeMetaTags,
          includeRatingTags,
          maxTags,
          preserveExisting: !autoTag,
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
      if (activeConcept.current !== conceptKey) return;

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
    selectionAnchor.current = filename;
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

  const selectAll = () => setSelectedImages(new Set(browsedImages.map(image => image.filename)));
  const selectNone = () => { setSelectedImages(new Set()); selectionAnchor.current = null; };
  const focusImage = (image: DatasetImage, event: MouseEvent | KeyboardEvent) => {
    setFocusedImage(image);
    setCaptionPaneOpen(true);
    if (event.shiftKey) {
      setSelectedImages(previous => selectDatasetImageRange(browsedImages.map(item => item.filename), previous, selectionAnchor.current, image.filename, event.ctrlKey || event.metaKey));
    } else if (event.ctrlKey || event.metaKey) {
      toggleImageSelect(image.filename);
    }
    selectionAnchor.current = image.filename;
  };

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
    const deletedNames = new Set(flaggedForDeletion);
    const result = await deleteImages(selectedDataset, selectedConcept, Array.from(deletedNames));
    if (!result.success) {
      await refreshAfterFailedDelete();
      showToast(result.error, 'error');
      return;
    }
    if (activeConcept.current !== conceptKey) return;
    await loadImages();
    if (activeConcept.current !== conceptKey) return;
    setSelectedImages(previous => new Set([...previous].filter(name => !deletedNames.has(name))));
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
  const otherConcepts = [
    ...(currentDataset?.concepts.filter(c => c.folder !== selectedConcept).map(c => ({ ...c, datasetName: selectedDataset! })) || []),
    ...datasets.filter(d => d.layout === 'flat' && d.name !== selectedDataset).flatMap(d => d.concepts.map(c => ({ ...c, datasetName: d.name }))),
  ];
  const selectedConceptPath = currentDataset?.path && selectedConcept
    ? currentDataset.layout === 'flat' || selectedConcept === selectedDataset
      ? currentDataset.path
      : `${currentDataset.path.replace(/[\\/]+$/, '')}\\${selectedConcept}`
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
      const savings = result.compressionPercent > 0 ? t('dataset.archiveSavings', { percent: result.compressionPercent }) : '';
      showToast(
        t('dataset.archiveCreated', { name: datasetName, count: result.fileCount, size: formatArchiveBytes(result.archiveBytes), savings }),
        'success',
      );
      if (!isUmbraRemoteClient()) await openDatasetArchivePath(result.archivePath);
    } catch (error: any) {
      showToast(error?.message || 'Failed to create dataset ZIP', 'error');
    } finally {
      setArchivingDataset(null);
    }
  };

  const contextImage = images.find(image => image.filename === imageContextMenu?.filename);
  const runImageContextAction = (action: () => void) => { setImageContextMenu(null); action(); };
  const imageContextItems: ContextMenuItem[] = contextImage ? [
    { label: 'Open Preview', icon: <ZoomIn size={14} />, action: () => runImageContextAction(() => openLightbox(images.indexOf(contextImage))) },
    { label: 'Edit Caption', icon: <Tag size={14} />, action: () => runImageContextAction(() => { setFocusedImage(contextImage); setCaptionPaneOpen(true); }) },
    { label: flaggedForDeletion.has(contextImage.filename) ? 'Clear Deletion Flag' : 'Flag for Deletion', icon: <Flag size={14} />, action: () => runImageContextAction(() => toggleFlag(contextImage.filename)) },
    { separator: true },
    { label: t('dataset.moveSelected', { count: selectedImages.size }), i18nSkip: true, icon: <Move size={14} />, disabled: selectedImages.size === 0 || otherConcepts.length === 0, action: () => runImageContextAction(() => setShowMoveModal(true)) },
    { label: t('dataset.deleteSelected', { count: selectedImages.size }), i18nSkip: true, icon: <Trash2 size={14} />, danger: true, disabled: selectedImages.size === 0, action: () => runImageContextAction(() => { void handleDeleteSelected(); }) },
  ] : [];
  const openImageContext = (image: DatasetImage, x: number, y: number) => {
    if (!selectedImages.has(image.filename)) setSelectedImages(new Set([image.filename]));
    selectionAnchor.current = image.filename;
    setImageContextMenu({ x, y, filename: image.filename });
  };

  return (
    <div data-umbra-datasets-workspace className="relative flex h-full min-h-0 overflow-hidden bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      {/* Left sidebar - Dataset tree */}
      <div id="dataset-folder-rail" className={`glass-panel absolute inset-y-0 left-0 z-30 w-52 shrink-0 rounded-none border-y-0 border-l-0 lg:relative lg:z-auto ${folderRailOpen ? 'flex flex-col' : 'hidden'}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400"><FolderTree size={14} /> Dataset Library</span>
          <button type="button" aria-label="Close dataset folders" onClick={() => setFolderRailOpen(false)} className="umbra-icon-button rounded p-1"><X size={14} /></button>
        </div>
        <div className="min-h-0 flex-1">
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
          onCreateRootConcept={() => { setCreateError(null); setShowNewConcept(true); }}
          onArchiveDataset={(dataset) => { void createDatasetZip(dataset); }}
          onOpenDatasetArchive={(archivePath) => { void openDatasetArchivePath(archivePath); }}
          onRenameDataset={openRenameDataset}
          onDeleteDataset={async (name) => {
            const kind = datasets.find(dataset => dataset.name === name)?.layout === 'flat' ? 'concept folder' : 'dataset';
            if (confirm(`Delete ${kind} "${name}" and all its contents?`)) {
              const deleted = await deleteDataset(name);
              if (!deleted) showToast('Could not delete dataset.', 'error');
              if (deleted && selectedDataset === name) {
                setSelectedDataset(null);
                setSelectedConcept(null);
              }
            }
          }}
          onDeleteConcept={async (dataset, concept) => {
            if (confirm(`Delete concept folder "${concept}"?`)) {
              const deleted = await deleteConcept(dataset, concept);
              if (!deleted) showToast('Could not delete concept.', 'error');
              if (deleted && selectedDataset === dataset && selectedConcept === concept) {
                setSelectedConcept(null);
              }
            }
          }}
          archivingDataset={archivingDataset}
        />
        </div>
        <div role="status" className="border-t border-white/10 px-3 py-2 text-[10px] text-zinc-500">{isLoadingDatasets ? 'Loading folders...' : `${datasets.length} folder${datasets.length === 1 ? '' : 's'}`}</div>
      </div>

      {/* Center - Image grid */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="glass-panel flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 rounded-none border-x-0 border-t-0 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1 text-xs text-zinc-300" aria-label="Dataset location">
              <FolderOpen size={14} className="mr-1 shrink-0 text-zinc-500" />
              <span className="truncate" title={selectedDataset || undefined}>{selectedDataset || 'Datasets'}</span>
              {selectedConcept && selectedConcept !== selectedDataset && <><ChevronRight size={12} className="shrink-0 text-zinc-600" /><span className="truncate" title={selectedConcept}>{selectedConcept}</span></>}
            </div>
            <div className="mt-1 truncate text-[11px] text-zinc-500" title={selectedConceptPath || undefined}>{selectedConcept ? `${images.length} images loaded` : 'Select a concept folder'}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Toggle dataset folders" aria-expanded={folderRailOpen} aria-controls="dataset-folder-rail" onClick={() => setFolderRailOpen(value => !value)} className="umbra-icon-button flex h-8 w-8 items-center justify-center rounded"><FolderTree size={15} /></button>
            <button type="button" aria-label="Toggle caption panel" aria-expanded={captionPaneOpen} aria-controls="dataset-caption-panel" onClick={() => setCaptionPaneOpen(value => !value)} className="umbra-icon-button flex h-8 w-8 items-center justify-center rounded"><PanelRight size={15} /></button>
            <button type="button" aria-label="Refresh dataset view" disabled={isLoadingImages || isLoadingDatasets} onClick={() => { void fetchDatasets(); if (selectedConcept) void loadImages(); }} className="umbra-icon-button flex h-8 w-8 items-center justify-center rounded disabled:opacity-40"><RefreshCw size={15} className={isLoadingImages || isLoadingDatasets ? 'animate-spin' : ''} /></button>
          </div>
        </header>
        {datasetError && !selectedConcept && <div role="alert" className="flex shrink-0 items-center justify-between gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200"><span>{datasetError}</span><button type="button" onClick={() => void fetchDatasets()} className="umbra-icon-button shrink-0 rounded px-2 py-1">Retry folders</button></div>}
        {selectedConcept && <div className="umbra-surface-soft flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
          <div className="flex min-w-[160px] flex-1 items-center rounded border border-white/10 focus-within:border-[var(--umbra-accent)]">
            <Search size={13} className="ml-2 shrink-0 text-zinc-500" />
            <input aria-label="Search dataset images" value={imageQuery} onChange={event => setImageQuery(event.target.value)} placeholder="Search filenames, captions, tags..." className="h-7 min-w-0 flex-1 bg-transparent px-2 text-xs outline-none placeholder:text-zinc-600" />
            {imageQuery && <button type="button" aria-label="Clear dataset search" onClick={() => setImageQuery('')} className="umbra-icon-button mr-1 rounded p-1"><X size={12} /></button>}
          </div>
          <UmbraSelectControl value={captionFilter} aria-label="Filter dataset captions" onChange={event => setCaptionFilter(event.target.value as DatasetCaptionFilter)} className="umbra-input h-7 rounded px-2 text-xs"><option value="all">All captions</option><option value="captioned">Captioned</option><option value="uncaptioned">Uncaptioned</option></UmbraSelectControl>
          <UmbraSelectControl value={imageSort} aria-label="Sort dataset images" onChange={event => setImageSort(event.target.value as DatasetImageSort)} className="umbra-input h-7 rounded px-2 text-xs"><option value="source">Folder order</option><option value="name">Name</option></UmbraSelectControl>
          <button type="button" aria-label={sortDescending ? 'Sort dataset ascending' : 'Sort dataset descending'} onClick={() => setSortDescending(value => !value)} className="umbra-icon-button flex h-7 w-7 items-center justify-center rounded">{sortDescending ? <ArrowDownAZ size={14} /> : <ArrowUpAZ size={14} />}</button>
        </div>}
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div className="min-w-0 text-xs text-zinc-500" role="status">
            <span>
              {selectedConcept ? (
                <>
                  {browsedImages.length} visible
                  {selectedImages.size > 0 && (
                    <span className="ml-2 text-[var(--umbra-accent)]">
                      {selectedImages.size} selected{selectedImages.size > filteredSelectionCount ? ` (${selectedImages.size - filteredSelectionCount} hidden)` : ''}
                    </span>
                  )}
                </>
              ) : (
                'Select a concept folder'
              )}
            </span>
          </div>

          {selectedConcept && (
            <div className="flex flex-wrap items-center gap-1.5">
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
                disabled={browsedImages.length === 0}
                title="Select all images matching the current view, including those not yet displayed"
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {imageQuery.trim() || captionFilter !== 'all' ? 'Select matches' : 'Select all'}
              </button>
              <button
                onClick={selectNone}
                className="umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Clear
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

              <button type="button" aria-expanded={tagSettingsOpen} aria-controls="dataset-tag-settings" onClick={() => setTagSettingsOpen(value => !value)} className={`umbra-icon-button flex items-center gap-1 rounded px-2 py-1 text-xs ${tagSettingsOpen ? 'text-[var(--umbra-accent)]' : ''}`}><SlidersHorizontal size={13} /> Caption tools <ChevronDown size={12} className={tagSettingsOpen ? 'rotate-180' : ''} /></button>

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
          <div id="dataset-tag-settings" hidden={!tagSettingsOpen} className="glass-panel custom-scrollbar max-h-[45%] shrink-0 overflow-y-auto rounded-none border-x-0 border-t-0 px-3 py-2">
            {conceptSettingsReadyKey !== selectedConceptSettingsKey && <div role="status" className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              <span>{conceptSettingsFailed ? 'Could not load concept settings.' : 'Loading concept settings...'}</span>
              {conceptSettingsFailed && <button type="button" className="umbra-icon-button rounded px-2 py-1" onClick={() => setConceptSettingsRetry(value => value + 1)}>Retry</button>}
            </div>}
            <fieldset disabled={conceptSettingsReadyKey !== selectedConceptSettingsKey} className="min-w-0 disabled:opacity-50">
              <div role="status" className="mb-2 min-h-6 text-xs text-zinc-400">
                {conceptSettingsReadyKey !== selectedConceptSettingsKey ? null : conceptSaveStatus.state === 'error' ? <>
                  <span className="text-red-400">{conceptSaveStatus.error}</span>
                  <button type="button" className="ml-2 rounded px-2 py-1" onClick={() => void conceptSessions.current.get(selectedConceptSettingsKey)?.retry()}>Retry save</button>
                  <button type="button" className="ml-2 rounded px-2 py-1" onClick={() => {
                    if (!window.confirm('Discard unsaved concept settings and reload?')) return;
                    conceptSessions.current.delete(selectedConceptSettingsKey);
                    setConceptSettingsRetry(value => value + 1);
                  }}>Reload</button>
                </> : conceptSaveStatus.state === 'saved' ? 'Settings saved' : conceptSaveStatus.state === 'saving' ? 'Saving settings...' : 'Unsaved settings'}
              </div>
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
                  className="umbra-input min-h-20 w-full resize-none rounded px-2 py-2 text-xs leading-relaxed placeholder:text-zinc-600 focus:border-[var(--umbra-accent)] focus:outline-none"
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
                  className="umbra-input min-h-20 w-full resize-none rounded px-2 py-2 text-xs leading-relaxed placeholder:text-zinc-600 focus:border-[var(--umbra-accent)] focus:outline-none"
                />
              </label>
              <div className="min-w-0 space-y-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setCaptionMode('tags')}
                    aria-pressed={captionMode === 'tags'}
                    className={`h-7 rounded border text-[10px] font-bold uppercase tracking-[0.12em] ${captionMode === 'tags' ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-[var(--umbra-text)]' : 'border-white/10 text-zinc-500'}`}
                  >
                    Tag list
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptionMode('natural')}
                    aria-pressed={captionMode === 'natural'}
                    className={`h-7 rounded border text-[10px] font-bold uppercase tracking-[0.12em] ${captionMode === 'natural' ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-[var(--umbra-text)]' : 'border-white/10 text-zinc-500'}`}
                  >
                    Natural
                  </button>
                </div>
                <UmbraSelectControl
                  value={captionMode === 'natural' ? naturalModel : taggerModel}
                  onChange={(e) => {
                    if (captionMode === 'natural') { setNaturalModel(e.target.value); return; }
                    const pixai = e.target.value === 'pixai-labs/pixai-tagger-v1.0';
                    setTaggerModel(e.target.value);
                    setGeneralThreshold(pixai ? 0.17 : 0.35);
                    setCharacterThreshold(pixai ? 0.27 : 0.85);
                    setRatingThreshold(pixai ? 0.41 : 0.25);
                    setGeneralMcutEnabled(false);
                    setCharacterMcutEnabled(false);
                  }}
                  className="umbra-input h-8 w-full rounded px-2 text-xs focus:border-[var(--umbra-accent)] focus:outline-none"
                  title="Caption model"
                >
                  {(captionMode === 'natural' ? NATURAL_MODEL_OPTIONS : WAIFU_MODEL_OPTIONS).map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </UmbraSelectControl>
              </div>
              <div className="col-span-full flex flex-wrap items-center justify-end gap-2">
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
                  className="flex h-8 items-center gap-1.5 rounded border border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] px-2 text-xs font-bold uppercase tracking-[0.12em] text-[var(--umbra-text)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  title={captionMode === 'natural' ? 'Replace captions with new natural-language captions' : 'Replace captions with newly generated tags'}
                >
                  {autoTagging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {selectedImages.size > 0
                    ? `${captionMode === 'natural' ? 'Caption' : 'Tag'} ${selectedImages.size}`
                    : captionMode === 'natural' ? 'Caption All' : 'Tag All'}
                </button>
              </div>
            </div>
            <div className={`${captionMode === 'tags' ? 'grid' : 'hidden'} mt-2 grid-cols-2 items-end gap-2 xl:grid-cols-3 2xl:grid-cols-[repeat(6,minmax(90px,1fr))_auto_auto]`}>
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
                  disabled={taggerModel === 'pixai-labs/pixai-tagger-v1.0'}
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
                  disabled={taggerModel === 'pixai-labs/pixai-tagger-v1.0'}
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
                ['Style', includeStyleTags, setIncludeStyleTags],
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
                  <UmbraSelectControl
                    value={naturalDevice}
                    onChange={(e) => setNaturalDevice(e.target.value as 'auto' | 'cpu' | 'cuda')}
                    className="umbra-input h-8 w-full rounded px-2 text-xs"
                  >
                    <option value="auto">Auto</option>
                    <option value="cuda">GPU</option>
                    <option value="cpu">CPU</option>
                  </UmbraSelectControl>
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
                <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-zinc-500">
                  Runs locally and writes factual prose captions, including explicit content. The model loads once for the selected batch.
                </p>
                <div className="h-8 min-w-[120px] rounded border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                  <span className="block text-[9px] text-zinc-600">Saved</span>
                  <span className="block font-bold text-zinc-300">{conceptSettingsReadyKey === selectedConceptSettingsKey ? 'Concept local' : 'Unavailable'}</span>
                </div>
              </div>
            )}
            </fieldset>
          </div>
        )}

        {/* Image grid - droppable */}
        <div
          ref={(node) => { imageScrollRef.current = node; setDropRef(node); }}
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
          onScroll={(event) => {
            const view = event.currentTarget;
            if (view.scrollHeight - view.scrollTop - view.clientHeight < 160) {
              setVisibleImageCount(count => Math.min(browsedImages.length, count + DATASET_IMAGE_PAGE_SIZE));
            }
          }}
          aria-label="Dataset images"
          className={`custom-scrollbar relative min-h-0 flex-1 overflow-y-auto p-3 transition-colors ${isOver || nativeDropActive ? 'bg-[var(--umbra-accent-glow)]' : ''}`}
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
            <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 size={18} className="animate-spin" /> Loading concept images
            </div>
          ) : imageLoadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-400">
              <p>Could not load concept images.</p>
              <button type="button" className="rounded border border-white/20 px-3 py-2 text-xs text-cyan-300 hover:bg-white/5" onClick={() => void loadImages()}>Retry</button>
            </div>
          ) : !selectedConcept ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-zinc-500">
              <FolderOpen size={24} />
              <p>Select a concept folder, then drag images from filmstrip</p>
              {!folderRailOpen && <button type="button" onClick={() => setFolderRailOpen(true)} className="umbra-icon-button rounded px-3 py-2 text-xs">Browse folders</button>}
            </div>
          ) : images.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-sm text-zinc-500">
              <p>No images - drag from filmstrip or download from Search</p>
            </div>
          ) : browsedImages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-500"><p>No matching images</p><button type="button" className="umbra-icon-button rounded px-3 py-2 text-xs" onClick={() => { setImageQuery(''); setCaptionFilter('all'); }}>Clear filters</button></div>
          ) : (<>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
              {browsedImages.slice(0, visibleImageCount).map(img => {
                const isSelected = selectedImages.has(img.filename);
                const isFocused = focusedImage?.filename === img.filename;
                const isFlagged = flaggedForDeletion.has(img.filename);

                return (
                  <div
                    key={img.filename}
                    data-umbra-dataset-image
                    className={`umbra-surface-soft group relative overflow-hidden rounded border cursor-pointer transition-colors
                               ${isFlagged ? 'ring-2 ring-red-500' : ''}
                               ${isFocused || isSelected ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]' : 'border-white/10 hover:border-white/25'}`}
                    onContextMenu={event => { event.preventDefault(); openImageContext(img, event.clientX, event.clientY); }}
                  >
                    <div className="relative aspect-square overflow-hidden">
                    <button type="button" aria-label={`Edit caption: ${img.filename}`} aria-pressed={isFocused} className="absolute inset-0 z-10 rounded focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--umbra-accent)]" onClick={event => focusImage(img, event)} onDoubleClick={() => openLightbox(images.indexOf(img))} onKeyDown={event => {
                      if (event.key === ' ' && (event.shiftKey || event.ctrlKey || event.metaKey)) { event.preventDefault(); focusImage(img, event); }
                      if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openImageContext(img, bounds.left, bounds.top); }
                    }} />
                    {/* Checkbox */}
                    <button
                      type="button"
                      aria-label={`Select image: ${img.filename}`}
                      aria-pressed={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleImageSelect(img.filename);
                      }}
                      className={`absolute top-2 left-2 z-20 flex h-6 w-6 items-center justify-center rounded border
                                 ${isSelected ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent)] text-[var(--umbra-bg)]' : 'border-white/20 bg-black/65'}`}
                    >
                      {isSelected && <Check size={14} />}
                    </button>

                    {/* Flag indicator */}
                    {isFlagged && (
                      <div className="absolute top-2 right-2 z-20 w-5 h-5 rounded bg-red-500 flex items-center justify-center" title="Flagged for deletion">
                        <Trash2 className="w-3 h-3 text-white" />
                      </div>
                    )}

                    <DatasetThumbnail image={img} datasetName={selectedDataset || ''} conceptFolder={selectedConcept || ''} />

                    {/* Caption indicator */}
                    {img.caption && (
                      <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                        <Tag className="w-3 h-3 text-green-400" />
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 z-20">
                      <DatasetRedownloadButton image={img} busy={repairingImages.has(repairKey(img.filename))} onRedownload={handleRedownload} compact />
                    </div>
                    </div>
                    <div className="flex items-center gap-1 border-t border-white/10 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-[10px] text-zinc-400" title={img.filename}>{img.filename}</span>
                      <button type="button" aria-label={`Image actions: ${img.filename}`} onClick={event => { const bounds = event.currentTarget.getBoundingClientRect(); openImageContext(img, bounds.right, bounds.bottom); }} className="umbra-icon-button shrink-0 rounded p-1"><MoreHorizontal size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            {visibleImageCount < browsedImages.length && (
              <button type="button" className="mt-3 w-full rounded border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5" onClick={() => setVisibleImageCount(count => Math.min(browsedImages.length, count + DATASET_IMAGE_PAGE_SIZE))}>
                Show more images ({Math.min(visibleImageCount, browsedImages.length)} of {browsedImages.length})
              </button>
            )}
          </>)}
        </div>
      </div>

      {/* Right sidebar - Caption editor */}
      <div id="dataset-caption-panel" className={`glass-panel absolute inset-y-0 right-0 z-30 w-72 shrink-0 flex-col rounded-none border-y-0 border-r-0 xl:relative xl:z-auto ${captionPaneOpen ? 'flex' : 'hidden'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2"><span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Image Details</span><button type="button" aria-label="Close caption panel" onClick={() => setCaptionPaneOpen(false)} className="umbra-icon-button rounded p-1"><X size={14} /></button></div>
        <div className="min-h-0 flex-1">
        <CaptionEditor
          image={focusedImage}
          datasetName={selectedDataset || ''}
          conceptFolder={selectedConcept || ''}
          onSave={handleSaveCaption}
          onRedownload={handleRedownload}
          isRedownloading={!!focusedImage && repairingImages.has(repairKey(focusedImage.filename))}
        />
        </div>
      </div>

      <ContextMenu isOpen={Boolean(imageContextMenu)} position={{ x: imageContextMenu?.x || 0, y: imageContextMenu?.y || 0 }} items={imageContextItems} onClose={() => setImageContextMenu(null)} />

      {/* Modals */}
      {/* Rename Dataset Modal */}
      {renameDatasetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-80 border-white/10 p-4">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-zinc-200">Rename {datasets.find(dataset => dataset.name === renameDatasetTarget)?.layout === 'flat' ? 'Concept Folder' : 'Dataset'}</h3>
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
                onClick={() => { setShowNewConcept(false); setNewName(''); setNewRepeats(10); setIsReg(false); setCreateError(null); }}
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
            <UmbraSelectControl
              value={moveToConcept}
              onChange={(e) => setMoveToConcept(e.target.value)}
              className="umbra-input w-full rounded px-3 py-2 text-white focus:border-cyan-400/60 focus:outline-none"
            >
              <option value="">Select concept...</option>
              {otherConcepts.map(c => {
                const folder = c.folder;
                return (
                  <option key={`${c.datasetName}/${folder}`} value={JSON.stringify([c.datasetName, folder])}>{c.datasetName === selectedDataset ? folder : `${c.datasetName} / ${folder}`}</option>
                );
              })}
            </UmbraSelectControl>
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
          onRedownload={handleRedownload}
          isRedownloading={filename => repairingImages.has(repairKey(filename))}
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
