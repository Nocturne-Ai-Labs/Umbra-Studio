import { describe, expect, it } from 'bun:test';
import { normalizePowerPrompterImageRestoreHandoff } from './powerPrompterImageRestoreHandoff';

describe('Power Prompter image restore handoff', () => {
  it('normalizes a Windows PNG path for a Gallery handoff', () => {
    expect(normalizePowerPrompterImageRestoreHandoff({
      path: 'D:\\outputs\\Set 1\\image.PNG',
      source: 'filmstrip',
      createdAt: 123,
    })).toEqual({
      version: 1,
      path: 'D:/outputs/Set 1/image.PNG',
      name: 'image.PNG',
      source: 'filmstrip',
      createdAt: 123,
    });
  });

  it('rejects blank and non-PNG media', () => {
    expect(normalizePowerPrompterImageRestoreHandoff({ path: '' })).toBeNull();
    expect(normalizePowerPrompterImageRestoreHandoff({ path: 'D:/outputs/image.jpg' })).toBeNull();
  });
});
