'use client';

import { useEffect } from 'react';

export function IdleFrameCap() {
  useEffect(() => {
    document.documentElement.removeAttribute('data-umbra-idle-fps-cap');
  }, []);

  return null;
}
