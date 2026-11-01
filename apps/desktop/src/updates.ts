import { relaunch } from '@tauri-apps/plugin-process'
import { load } from '@tauri-apps/plugin-store'
import { check } from '@tauri-apps/plugin-updater'

/** App settings (stored on this Mac). */
export type Settings = { autoUpdate: boolean }

const store = () => load('settings.json', { autoSave: true, defaults: { autoUpdate: true } })

export async function loadSettings(): Promise<Settings> {
  const s = await store()
  return { autoUpdate: (await s.get<boolean>('autoUpdate')) ?? true }
}

export async function saveSettings(settings: Settings) {
  const s = await store()
  await s.set('autoUpdate', settings.autoUpdate)
}

/**
 * Look for a newer signed release on GitHub; ask before installing, then
 * restart. Returns a message for the status bar (null when there is nothing to
 * say on an automatic check).
 */
export async function checkForUpdates(manual: boolean): Promise<string | null> {
  try {
    const update = await check()
    if (!update) return manual ? 'You have the latest version.' : null
    if (!confirm(`OnePedigree ${update.version} is available. Install it now? The app restarts afterwards.`)) return `Update ${update.version} is available.`
    await update.downloadAndInstall()
    await relaunch()
    return null
  } catch (e) {
    return manual ? `Could not check for updates: ${(e as Error).message}` : null
  }
}
