export async function openUmbraSetup(section: 'tools' | 'models' | 'updates' | 'onboarding' = 'onboarding'): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const response = await fetch('/api/setup/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab: section }) });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || 'Unable to open Umbra Setup.');
    if (!tab) throw new Error('Allow popups to open Umbra Setup, or run UmbraSetup.bat / umbra-setup.sh from your Umbra folder.');
    tab.location.href = result.url;
  } catch (error) { tab?.close(); throw error; }
}

export const openUmbraToolsSetup = () => openUmbraSetup('tools');
