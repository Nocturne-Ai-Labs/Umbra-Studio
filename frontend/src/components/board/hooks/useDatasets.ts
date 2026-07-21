import { useState, useCallback, useEffect } from 'react';
import type { Dataset, DatasetImage } from '../types';

export interface DatasetConceptSettings {
  triggerTags: string;
  prependTags: string;
  captionMode: 'tags' | 'natural';
  modelRepo: string;
  naturalModelRepo: string;
  naturalDevice: 'auto' | 'cpu' | 'cuda';
  naturalMaxNewTokens: number;
  generalThreshold: number;
  characterThreshold: number;
  ratingThreshold: number;
  generalMcutEnabled: boolean;
  characterMcutEnabled: boolean;
  includeGeneralTags: boolean;
  includeCharacterTags: boolean;
  includeCopyrightTags: boolean;
  includeArtistTags: boolean;
  includeMetaTags: boolean;
  includeRatingTags: boolean;
  maxTags: number;
  preserveExisting: boolean;
  replaceUnderscoresWithSpaces: boolean;
  updatedAt?: number;
}

export interface DatasetArchiveResult {
  archivePath: string;
  archiveBytes: number;
  sourceBytes: number;
  savedBytes: number;
  compressionPercent: number;
  fileCount: number;
  directoryCount: number;
}

export function useDatasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getResponseError = async (response: Response, fallback: string): Promise<string> => {
    try {
      const data = await response.json();
      return typeof data?.error === 'string' ? data.error : fallback;
    } catch {
      return fallback;
    }
  };

  // Fetch all datasets
  const fetchDatasets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/datasets');
      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to fetch datasets'));

      const data = await response.json();
      setDatasets(data.datasets || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create new dataset
  const createDataset = useCallback(async (name: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to create dataset'));

      await fetchDatasets();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchDatasets]);

  // Delete dataset
  const deleteDataset = useCallback(async (name: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to delete dataset'));

      await fetchDatasets();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchDatasets]);

  // Rename dataset
  const renameDataset = useCallback(async (oldName: string, newName: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(oldName)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to rename dataset'));

      await fetchDatasets();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchDatasets]);

  const archiveDataset = useCallback(async (name: string): Promise<DatasetArchiveResult> => {
    setError(null);
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(name)}/archive`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to create dataset ZIP'));
      const result = await response.json() as DatasetArchiveResult;
      await fetchDatasets();
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [fetchDatasets]);

  // Create concept folder
  const createConcept = useCallback(async (
    datasetName: string,
    conceptName: string,
    repeats: number = 10,
    isReg: boolean = false
  ): Promise<boolean> => {
    try {
      const response = await fetch(`/api/datasets/${encodeURIComponent(datasetName)}/concept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: conceptName, repeats, isReg }),
      });

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to create concept'));

      await fetchDatasets();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchDatasets]);

  // Delete concept folder
  const deleteConcept = useCallback(async (
    datasetName: string,
    conceptName: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `/api/datasets/${encodeURIComponent(datasetName)}/concept/${encodeURIComponent(conceptName)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to delete concept'));

      await fetchDatasets();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchDatasets]);

  // Get images in a concept
  const getConceptImages = useCallback(async (
    datasetName: string,
    conceptFolder: string
  ): Promise<DatasetImage[]> => {
    try {
      const response = await fetch(
        `/api/datasets/${encodeURIComponent(datasetName)}/concept/${encodeURIComponent(conceptFolder)}/images`
      );

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to fetch images'));

      const data = await response.json();
      return data.images || [];
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, []);

  const getConceptSettings = useCallback(async (
    datasetName: string,
    conceptFolder: string
  ): Promise<DatasetConceptSettings | null> => {
    try {
      const response = await fetch(
        `/api/datasets/${encodeURIComponent(datasetName)}/concept/${encodeURIComponent(conceptFolder)}/settings`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to fetch concept settings'));
      const data = await response.json();
      return data.settings || null;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const saveConceptSettings = useCallback(async (
    datasetName: string,
    conceptFolder: string,
    settings: Partial<DatasetConceptSettings>
  ): Promise<DatasetConceptSettings | null> => {
    try {
      const response = await fetch(
        `/api/datasets/${encodeURIComponent(datasetName)}/concept/${encodeURIComponent(conceptFolder)}/settings`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        }
      );
      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to save concept settings'));
      const data = await response.json();
      return data.settings || null;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  // Save caption for an image
  const saveCaption = useCallback(async (
    datasetName: string,
    conceptFolder: string,
    imageName: string,
    caption: string
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/dataset/save-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: datasetName,
          concept: conceptFolder,
          image: imageName,
          caption,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Move images between concepts
  const moveImages = useCallback(async (
    datasetName: string,
    images: string[],
    fromConcept: string,
    toConcept: string
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/datasets/move-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: datasetName,
          images,
          from: fromConcept,
          to: toConcept,
        }),
      });

      if (!response.ok) throw new Error(await getResponseError(response, 'Failed to move images'));

      await fetchDatasets();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [fetchDatasets]);

  // Delete images
  const deleteImages = useCallback(async (
    datasetName: string,
    conceptFolder: string,
    images: string[]
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/datasets/delete-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset: datasetName,
          concept: conceptFolder,
          images,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // Load on mount
  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  return {
    datasets,
    isLoading,
    error,
    fetchDatasets,
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
  };
}
