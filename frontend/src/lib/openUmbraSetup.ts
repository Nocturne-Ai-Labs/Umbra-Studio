export async function openUmbraToolsSetup(): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const response = await fetch('/api/tools/setup', { method: 'POST' });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || 'Unable to open Umbra Setup.');
    if (!tab) throw new Error('Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.');
    tab.location.href = result.url;
  } catch (error) { tab?.close(); throw error; }
}
