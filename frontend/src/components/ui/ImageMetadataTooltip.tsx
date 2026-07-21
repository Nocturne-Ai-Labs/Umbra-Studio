'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { extractMetadataFromPath, extractPrompts, extractGenerationParams, ImageMetadata } from '@/utils/metadata';
import { metadataCache } from '@/utils/metadataCache';

interface TooltipPosition {
  x: number;
  y: number;
}

interface UseImageMetadataTooltipOptions {
  delay?: number; // ms before showing tooltip
  enabled?: boolean;
}

/**
 * Hook for image metadata tooltip with simple fade visibility
 * Returns event handlers and Portal component
 */
export function useImageMetadataTooltip(
  imagePath: string | null,
  options: UseImageMetadataTooltipOptions = {}
) {
  const { delay = 400, enabled = true } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ x: 0, y: 0 });
  const [metadata, setMetadata] = useState<ImageMetadata | null>(null);

  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentPathRef = useRef<string | null>(null);

  /**
   * Fetch and parse metadata for image
   */
  const fetchMetadata = useCallback(async (path: string) => {
    if (!path) return null;
    
    // Check cache first
    const cached = metadataCache.get(path);
    if (cached) {
      setMetadata(cached);
      return cached;
    }

    try {
      const meta = await extractMetadataFromPath(path);

      if (meta) {
        // Cache the result
        metadataCache.set(path, meta);
        setMetadata(meta);
        return meta;
      }
    } catch (err) {
      console.error('[ImageMetadataTooltip] Failed to fetch metadata:', err);
    }

    return null;
  }, []);

  /**
   * Show tooltip
   */
  const showTooltip = useCallback(async () => {
    if (!imagePath || !enabled) return;

    try {
      const meta = await fetchMetadata(imagePath);
      if (!meta) return;

      const prompts = extractPrompts(meta);
      if (!prompts.positive && !prompts.negative) return;

      setIsVisible(true);
    } catch (err) {
      console.error('[ImageMetadataTooltip] Error showing tooltip:', err);
      setIsVisible(false);
    }
  }, [imagePath, enabled, fetchMetadata]);

  /**
   * Hide tooltip
   */
  const hideTooltip = useCallback(() => {
    setIsVisible(false);
    setMetadata(null);
  }, []);

  /**
   * Handle mouse enter
   */
  const onMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled || !imagePath) return;

      currentPathRef.current = imagePath;

      // Clear any pending hide
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      // Delay showing to avoid flicker
      showTimeoutRef.current = setTimeout(() => {
        if (currentPathRef.current === imagePath) {
          showTooltip();
          updatePosition(e);
        }
      }, delay);
    },
    [imagePath, enabled, delay, showTooltip]
  );

  /**
   * Handle mouse leave
   */
  const onMouseLeave = useCallback(() => {
    // Clear show timeout
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }

    // Hide with slight delay
    hideTimeoutRef.current = setTimeout(() => {
      hideTooltip();
    }, 100);

    currentPathRef.current = null;
  }, [hideTooltip]);

  /**
   * Update tooltip position
   */
  const updatePosition = useCallback((e: MouseEvent | React.MouseEvent) => {
    const padding = 15;
    const x = (e as MouseEvent).clientX || (e as React.MouseEvent).clientX;
    const y = (e as MouseEvent).clientY || (e as React.MouseEvent).clientY;

    setPosition({ x: x + padding, y: y + padding });
  }, []);

  /**
   * Handle mouse move
   */
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isVisible) {
        updatePosition(e);
      }
    },
    [isVisible, updatePosition]
  );

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      hideTooltip();
    }
  }, [enabled, hideTooltip]);

  /**
   * Tooltip Portal Component
   */
  const TooltipPortal = useCallback(() => {
    if (!isVisible || !metadata) return null;

    const prompts = extractPrompts(metadata);
    const params = extractGenerationParams(metadata);

    return createPortal(
      <TooltipContent
        position={position}
        prompts={prompts}
        params={params}
        metadata={metadata}
      />,
      document.body
    );
  }, [isVisible, metadata, position]);

  return {
    onMouseEnter,
    onMouseLeave,
    onMouseMove,
    TooltipPortal,
  };
}

/**
 * Tooltip Content Component
 */
interface TooltipContentProps {
  position: TooltipPosition;
  prompts: { positive: string | null; negative: string | null };
  params: Partial<ImageMetadata>;
  metadata: ImageMetadata;
}

function TooltipContent({ position, prompts, params, metadata }: TooltipContentProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to keep within viewport
  useEffect(() => {
    if (!tooltipRef.current) return;

    try {
      const rect = tooltipRef.current.getBoundingClientRect();
      const padding = 15;

      let { x, y } = position;

      // Keep within viewport horizontally
      if (x + rect.width > window.innerWidth - padding) {
        x = position.x - rect.width - (padding * 2);
      }

      // Keep within viewport vertically
      if (y + rect.height > window.innerHeight - padding) {
        y = position.y - rect.height - (padding * 2);
      }

      x = Math.max(padding, Math.min(x, window.innerWidth - rect.width - padding));
      y = Math.max(padding, Math.min(y, window.innerHeight - rect.height - padding));

      setAdjustedPosition({ x, y });
    } catch (err) {
      // If positioning fails, use original position
      setAdjustedPosition(position);
    }
  }, [position]);

  return (
    <div
      ref={tooltipRef}
      className="image-metadata-tooltip visible"
      style={{
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
    >
      {prompts.positive && (
        <div className="tooltip-prompt">
          <div className="tooltip-prompt-label positive">
            <i className="fas fa-plus-circle"></i> Positive
          </div>
          <div className="tooltip-prompt-text">{prompts.positive}</div>
        </div>
      )}

      {prompts.negative && (
        <div className="tooltip-prompt">
          <div className="tooltip-prompt-label negative">
            <i className="fas fa-minus-circle"></i> Negative
          </div>
          <div className="tooltip-prompt-text negative">{prompts.negative}</div>
        </div>
      )}

      {/* Always show params section if metadata exists */}
      {params && Object.keys(params).length > 0 && (
        <div className="tooltip-params">
          {params.model && (
            <div className="tooltip-param">
              Model: <span>{params.model.split('/').pop()?.split('.')[0]}</span>
            </div>
          )}
          {params.seed !== undefined && (
            <div className="tooltip-param">
              Seed: <span>{params.seed}</span>
            </div>
          )}
          {params.steps && (
            <div className="tooltip-param">
              Steps: <span>{params.steps}</span>
            </div>
          )}
          {params.cfg && (
            <div className="tooltip-param">
              CFG: <span>{params.cfg}</span>
            </div>
          )}
          {params.sampler && (
            <div className="tooltip-param">
              Sampler: <span>{params.sampler}</span>
            </div>
          )}
          {params.scheduler && (
            <div className="tooltip-param">
              Scheduler: <span>{params.scheduler}</span>
            </div>
          )}
          {params.width && params.height && (
            <div className="tooltip-param">
              Size: <span>{params.width}x{params.height}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Fallback - show format if no params but metadata exists */}
      {(!params || Object.keys(params).length === 0) && metadata?.format && (
        <div className="tooltip-params">
          <div className="tooltip-param" style={{ gridColumn: '1 / -1' }}>
            Format: <span>{metadata.format}</span>
          </div>
        </div>
      )}
    </div>
  );
}
