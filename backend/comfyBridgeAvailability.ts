const OPEN_EDITOR_GUIDANCE: Record<string, string> = {
  en: 'In the ComfyUI workspace, choose Open UI and wait for the workflow bridge to connect.',
  ja: 'ComfyUI ワークスペースで「UI を開く」を選び、ワークフローブリッジの接続をお待ちください。',
  'zh-CN': '请在 ComfyUI 工作区选择“打开界面”，然后等待工作流桥接连接。',
  ko: 'ComfyUI 작업 공간에서 UI 열기를 선택하고 워크플로 브리지가 연결될 때까지 기다리세요.',
  de: 'Wähle im ComfyUI-Arbeitsbereich „Oberfläche öffnen“ und warte, bis die Workflow-Bridge verbunden ist.',
};

export function getComfyBridgeUnavailableError(bridgeId: string, language: unknown): string {
  const detail = bridgeId
    ? `Selected workflow target is not connected (${bridgeId}).`
    : 'No ComfyUI bridge is connected to /ws/prompter.';
  return `${detail} ${OPEN_EDITOR_GUIDANCE[String(language)] || OPEN_EDITOR_GUIDANCE.en}`;
}
