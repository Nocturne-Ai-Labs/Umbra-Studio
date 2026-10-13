import { loader } from '@monaco-editor/react';

let loading: Promise<typeof import('monaco-editor')> | null = null;
export function loadLocalMonaco(): Promise<typeof import('monaco-editor')> {
  if (loading) return loading;
  const entry = '/assets/monaco/editor.js';
  loading = import(entry).then(async monaco => {
    const workerNames: Record<string, string> = { json: 'json', css: 'css', scss: 'css', less: 'css', html: 'html', handlebars: 'html', razor: 'html', typescript: 'typescript', javascript: 'typescript' };
    (self as typeof self & { MonacoEnvironment?: unknown }).MonacoEnvironment = {
      getWorker: (_moduleId: string, label: string) => new Worker(`/assets/monaco/${workerNames[label] || 'editor'}.worker.js`, { type: 'module' }),
    };
    const cssId = 'umbra-monaco-style';
    if (!document.getElementById(cssId)) {
      const style = document.createElement('link');
      style.id = cssId; style.rel = 'stylesheet'; style.href = '/assets/monaco/editor.css';
      await new Promise<void>((resolve, reject) => {
        style.onload = () => resolve();
        style.onerror = () => { style.remove(); reject(new Error('Editor stylesheet could not load.')); };
        document.head.append(style);
      });
    }
    loader.config({ monaco });
    return monaco as typeof import('monaco-editor');
  }).catch(error => { loading = null; throw error; });
  return loading;
}
