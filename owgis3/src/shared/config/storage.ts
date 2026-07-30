import type { SiteConfig } from "./types";

const STORAGE_KEY = "owgis3.siteConfig";

/**
 * Persist site config in sessionStorage for builder → viewer handoff.
 *
 * @param site site configuration
 */
export function saveSiteToSession(site: SiteConfig): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(site));
}

/**
 * Load site config from sessionStorage.
 *
 * @returns site config or null
 */
export function loadSiteFromSession(): SiteConfig | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SiteConfig;
  } catch {
    return null;
  }
}

/**
 * Persist site config to localStorage for longer-lived drafts.
 *
 * @param site site configuration
 */
export function saveSiteDraft(site: SiteConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(site));
}

/**
 * Load draft from localStorage.
 *
 * @returns site config or null
 */
export function loadSiteDraft(): SiteConfig | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as SiteConfig;
  } catch {
    return null;
  }
}

/**
 * Download a JSON file in the browser.
 *
 * @param filename download name
 * @param data object to serialize
 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download a text file in the browser.
 *
 * @param filename download name
 * @param text file contents
 * @param mime MIME type
 */
export function downloadText(filename: string, text: string, mime = "application/xml"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
