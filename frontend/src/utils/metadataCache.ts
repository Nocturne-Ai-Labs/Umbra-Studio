/**
 * LRU Cache for image metadata
 * Prevents re-parsing the same images repeatedly
 */

import { ImageMetadata } from './metadata';

class MetadataCache {
  private cache: Map<string, ImageMetadata>;
  private keys: string[];
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.keys = [];
    this.maxSize = maxSize;
  }

  /**
   * Get cached metadata for a path
   */
  get(path: string): ImageMetadata | null {
    return this.cache.get(path) || null;
  }

  /**
   * Set metadata for a path
   * Implements LRU eviction when cache is full
   */
  set(path: string, metadata: ImageMetadata): void {
    // If already exists, remove it from keys array (we'll re-add at end)
    const existingIndex = this.keys.indexOf(path);
    if (existingIndex !== -1) {
      this.keys.splice(existingIndex, 1);
    }

    // If at max size, evict oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(path)) {
      const oldest = this.keys.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    // Add/update entry
    this.cache.set(path, metadata);
    this.keys.push(path);
  }

  /**
   * Check if path is cached
   */
  has(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * Clear all cached metadata
   */
  clear(): void {
    this.cache.clear();
    this.keys = [];
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Remove specific entry
   */
  delete(path: string): boolean {
    const index = this.keys.indexOf(path);
    if (index !== -1) {
      this.keys.splice(index, 1);
    }
    return this.cache.delete(path);
  }
}

// Export singleton instance
export const metadataCache = new MetadataCache(100);
