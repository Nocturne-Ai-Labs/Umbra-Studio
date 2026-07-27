import React from 'react';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackendSplash } from './Workspace';

describe('mobile ComfyUI manager', () => {
  test('renders the remote management workspace without missing runtime helpers', () => {
    const markup = renderToStaticMarkup(
      <BackendSplash
        name="ComfyUI"
        backend="comfyui"
        icon=""
        mobileManager
      />,
    );

    expect(markup).toContain('data-umbra-mobile-comfy-manager');
    expect(markup).toContain('Launch ComfyUI');
  });
});
