import type { UiPreferencesV1 } from "./types";
import { DEFAULT_UI_PREFERENCES } from "./types";

const STORAGE_KEY = "robocon.ui.preferences.v1";

export function loadUiPreferences(): UiPreferencesV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.version === 1) {
      return {
        version: 1,
        manualThrottlePercent: typeof parsed.manualThrottlePercent === "number"
          ? Math.max(0, Math.min(100, Math.round(parsed.manualThrottlePercent)))
          : DEFAULT_UI_PREFERENCES.manualThrottlePercent,
        precision: Boolean(parsed.precision),
        hintsVisible: parsed.hintsVisible !== undefined ? Boolean(parsed.hintsVisible) : DEFAULT_UI_PREFERENCES.hintsVisible,
        preferredView: parsed.preferredView === "top" ? "top" : "perspective",
        reduceUiMotion: Boolean(parsed.reduceUiMotion),
        localDisplayName: typeof parsed.localDisplayName === "string"
          ? parsed.localDisplayName.slice(0, 40)
          : DEFAULT_UI_PREFERENCES.localDisplayName,
      };
    }
  } catch {
    // localStorage unavailable or parse error; fallback to defaults
  }
  return { ...DEFAULT_UI_PREFERENCES };
}

export function saveUiPreferences(prefs: UiPreferencesV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota/storage exceptions
  }
}
