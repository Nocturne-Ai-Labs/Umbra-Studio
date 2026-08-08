export const UMBRA_UI_TXT2IMG_OUTPUT_FOLDER = 'Umbra UI/txt2img';

export interface UmbraUiPrompterOutputLayout {
  outputFolder: string;
  saveToDateFolder: true;
  saveToSetSubfolder: true;
  setSubfolder: string;
  styleSubfolder: string;
  saveImageFilenamePrefix: string;
}

function sanitizeOutputSegment(value: unknown, fallback = ''): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"|?*]/g, '')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
    .trim();
  return normalized || fallback;
}

export function resolveUmbraUiPrompterOutputLayout(options: {
  queueOrigin: unknown;
  outputMode: unknown;
  promptSetId: unknown;
  outputSubfolder: unknown;
  dateFolder: string;
}): UmbraUiPrompterOutputLayout | null {
  if (String(options.queueOrigin || '').trim() !== 'power_prompter') return null;
  if (String(options.outputMode || '').trim().toLowerCase() !== 'txt2img') return null;

  const promptSetId = Math.max(1, Math.min(10, Math.floor(Number(options.promptSetId) || 1)));
  const setSubfolder = `Set ${promptSetId}`;
  const styleSubfolder = sanitizeOutputSegment(options.outputSubfolder);
  const dateFolder = sanitizeOutputSegment(options.dateFolder);
  const relativeParts = [UMBRA_UI_TXT2IMG_OUTPUT_FOLDER, dateFolder, setSubfolder, styleSubfolder].filter(Boolean);

  return {
    outputFolder: UMBRA_UI_TXT2IMG_OUTPUT_FOLDER,
    saveToDateFolder: true,
    saveToSetSubfolder: true,
    setSubfolder,
    styleSubfolder,
    saveImageFilenamePrefix: `${relativeParts.join('/')}/UmbraUI_txt2img_%date%`,
  };
}

export function applyUmbraUiPrompterOutputLayout(
  classType: unknown,
  node: unknown,
  layout: UmbraUiPrompterOutputLayout,
): boolean {
  if (!node || typeof node !== 'object') return false;
  const target = node as { inputs?: Record<string, unknown> };
  if (!target.inputs || typeof target.inputs !== 'object' || Array.isArray(target.inputs)) {
    target.inputs = {};
  }

  const normalizedClassType = String(classType || '').trim();
  if (normalizedClassType === 'UmbraLabSaveImage' || normalizedClassType === 'UmbraLabSaveImageSimple') {
    target.inputs.output_folder = layout.outputFolder;
    target.inputs.save_to_yyyy_mm_dd_folder = layout.saveToDateFolder;
    target.inputs.save_to_set_subfolder = layout.saveToSetSubfolder;
    target.inputs.set_subfolder = layout.setSubfolder;
    target.inputs.save_set_to_style_subfolder = layout.styleSubfolder;
    return true;
  }

  if (normalizedClassType === 'SaveImage') {
    target.inputs.filename_prefix = layout.saveImageFilenamePrefix;
    return true;
  }

  return false;
}
