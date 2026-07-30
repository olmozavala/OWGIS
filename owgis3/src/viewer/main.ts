import OlMap from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import { fromLonLat, toLonLat, transformExtent } from "ol/proj";
import MousePosition from "ol/control/MousePosition";
import ScaleLine from "ol/control/ScaleLine";
import { defaults as defaultControls } from "ol/control/defaults";
import { createStringXY } from "ol/coordinate";
import Draw from "ol/interaction/Draw";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type { LineString } from "ol/geom";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style";
import "ol/ol.css";
import type { LayerConfig, SiteConfig } from "../shared/config/types";
import { getSelectedMainLayer } from "../shared/config/xml";
import { loadSiteFromSession, loadSiteDraft } from "../shared/config/storage";
import {
  animationTimestepsUrl,
  fetchWmsJson,
  getFeatureInfoUrl,
  getTimeseriesUrl,
  getVerticalProfileUrl,
  legendUrl,
  loadLayerDetails,
  minMaxUrl,
  timestepsUrl,
  viaProxy,
  type NcwmsLayerDetails,
} from "../shared/wms/client";
import type { Tile as OlTile } from "ol";
import { initFloatingWindows } from "./draggable";
import {
  applyMobileDocument,
  MobileChrome,
  resolveMobileMode,
  watchMobileBreakpoint,
} from "./mobile";
import { createCesiumController } from "./cesium3d";
import {
  chartToPngDataUrl,
  disposePlotChart,
  parseNcwmsCsv,
  renderTimeSeriesChart,
  renderVerticalProfileChart,
  resizePlotChart,
} from "./charts";
import { StreamlinesController } from "./streamlines/controller";
import { MonthCalendar, availableDateSet } from "./calendarWidget";

type AnimOption = { title: string; timeString: string; frames: number };

/**
 * Inline SVG icons for the top toolbar (modern stand-ins for OWGIS2 Glyphicons).
 */
const TOOL_ICONS = {
  eye: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>`,
  depth: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 3 7v2l9 5 9-5V7l-9-5zm0 9.2L5.2 8.4 12 4.6l6.8 3.8L12 11.2zM3 12.5v2l9 5 9-5v-2l-9 5-9-5zm0 5v2l9 5 9-5v-2l-9 5-9-5z"/></svg>`,
  tint: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2S6 9.1 6 14a6 6 0 0 0 12 0c0-4.9-6-11.8-6-11.8zm0 16.3A3.5 3.5 0 0 1 8.5 15c0-2.2 2.2-5.4 3.5-7.2 1.3 1.8 3.5 5 3.5 7.2A3.5 3.5 0 0 1 12 18.5z"/></svg>`,
  transect: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.5 18.5h2.2V9.8H3.5v8.7zm5.1 0h2.2V5.5H8.6v13zm5.1 0h2.2v-6.2h-2.2v6.2zm5.1 0H21V3.8h-2.2v14.7z"/></svg>`,
  refresh: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 6.4A7.8 7.8 0 0 0 5.3 9.1H2.8l3.7 3.7 3.7-3.7H7.6a5.4 5.4 0 1 1 1.6 5.9l-1.7 1.7A7.8 7.8 0 1 0 17.6 6.4z"/></svg>`,
  play: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.2v13.6l11-6.8L8 5.2z"/></svg>`,
  streams: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3 7.5c3.2-2.2 6.2 2.2 9.5 0s6.3-2.2 8.5 0"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3 12c3.2-2.2 6.2 2.2 9.5 0s6.3-2.2 8.5 0"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M3 16.5c3.2-2.2 6.2 2.2 9.5 0s6.3-2.2 8.5 0"/><circle fill="currentColor" cx="6.2" cy="6.6" r="1.15"/><circle fill="currentColor" cx="12.5" cy="12.9" r="1.15"/><circle fill="currentColor" cx="18.2" cy="15.2" r="1.15"/></svg>`,
  globe: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-3.1a15 15 0 0 0-1.3-3.3A8 8 0 0 1 18.9 8zM12 4c.7 0 1.9 1.5 2.6 4h-5.2C10.1 5.5 11.3 4 12 4zM4.3 14a8 8 0 0 1 0-4h3.5a17 17 0 0 0 0 4H4.3zm.8 2h3.1c.3 1.2.7 2.3 1.3 3.3A8 8 0 0 1 5.1 16zm3.1-8H5.1A8 8 0 0 1 9.5 4.7C8.9 5.7 8.5 6.8 8.2 8zM12 20c-.7 0-1.9-1.5-2.6-4h5.2c-.7 2.5-1.9 4-2.6 4zm3.5-6H8.5a15 15 0 0 1 0-4h7a15 15 0 0 1 0 4zm.3 5.3c.6-1 1-2.1 1.3-3.3h3.1a8 8 0 0 1-4.4 3.3zM16.3 8c.3-1.2.7-2.3 1.3-3.3A8 8 0 0 1 18.9 8h-2.6z"/></svg>`,
  tools: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m21.7 13.3-1.1-.6a7.2 7.2 0 0 0 0-1.4l1.1-.6-1.5-2.6-1.3.3a7 7 0 0 0-1.2-.7l-.2-1.3h-3l-.2 1.3c-.4.2-.8.4-1.2.7l-1.3-.3-1.5 2.6 1.1.6a7.2 7.2 0 0 0 0 1.4l-1.1.6 1.5 2.6 1.3-.3c.4.3.8.5 1.2.7l.2 1.3h3l.2-1.3c.4-.2.8-.4 1.2-.7l1.3.3 1.5-2.6zM12.5 14.2a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zM8.2 4.8 7.4 3.5 4.8 5l.5 1.3c-.3.3-.5.6-.7 1L3.3 7.1 2 9.7l1.2.7c0 .4 0 .8.1 1.2l-1.1.9 1.5 2.4 1.3-.2c.3.3.6.5 1 .7l.2 1.3 2.6-.2-.2-1.4c.3-.3.5-.7.7-1.1l1.3.4 1.3-2.5-1.2-.7c0-.4 0-.8-.1-1.1l1.1-1-1.5-2.4-1.3.3c-.3-.4-.6-.6-1-.8l-.2-1.3zm-.7 6.9a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>`,
  builder: `<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 4h8v7H3V4zm10 0h8v4h-8V4zM3 13h5v7H3v-7zm7 3h11v4H10v-4zm0-3h11v2H10v-2z"/></svg>`,
  minus: `<svg class="tool-icon tool-icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>`,
  plus: `<svg class="tool-icon tool-icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>`,
} as const;

/**
 * Produce approximately `count` nicely rounded ticks between min and max
 * (same role as d3.scaleLinear().ticks in OWGIS 2 Palettes.js).
 *
 * @param minVal scale minimum
 * @param maxVal scale maximum
 * @param count desired tick count
 * @returns tick values
 */
function niceTicks(minVal: number, maxVal: number, count: number): number[] {
  if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
    return [];
  }
  if (minVal === maxVal) {
    return [minVal];
  }
  const lo = Math.min(minVal, maxVal);
  const hi = Math.max(minVal, maxVal);
  const span = hi - lo;
  const step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const residual = step0 / mag;
  const step = residual >= 5 ? 5 * mag : residual >= 2 ? 2 * mag : mag;
  const start = Math.ceil((lo - step * 1e-12) / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

/**
 * Format a colorbar tick for display (compact, readable).
 *
 * @param value numeric tick
 * @returns label text
 */
function formatColorbarTick(value: number): string {
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1000 || abs < 0.001)) {
    return value.toExponential(1);
  }
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(rounded);
}

/**
 * Convert a #rrggbb (or #rgb) color to rgba() for canvas strokeStyle.
 *
 * @param hex color input value
 * @param alpha opacity 0–1
 * @returns rgba CSS color
 */
function hexToRgba(hex: string, alpha = 0.6): string {
  const raw = hex.trim().replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : raw.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Build an icon-only toolbar button.
 *
 * @param id button id
 * @param title tooltip / accessible name
 * @param icon SVG markup
 * @param extraClass optional extra classes
 * @returns button HTML
 */
function iconButton(id: string, title: string, icon: string, extraClass = ""): string {
  return `<button type="button" class="buttonStyle icon-btn ${extraClass}" id="${id}" title="${title}" aria-label="${title}">${icon}</button>`;
}

/**
 * Title-bar chrome for a floating window.
 *
 * @param title window title text
 * @param options.allowMinimize when false, only close is shown (toolbar tool panels)
 * @returns HTML snippet
 */
function windowChrome(title: string, options: { allowMinimize?: boolean } = {}): string {
  const allowMinimize = options.allowMinimize !== false;
  return `<div class="win-title">
      <span class="title-text">${title}</span>
      <span class="win-chrome">
        ${allowMinimize ? `<button type="button" class="win-min" title="Minimize">▁</button>` : ""}
        <button type="button" class="win-close" title="Close">✕</button>
      </span>
    </div>`;
}

/**
 * Build cascaded main-layer dropdown HTML (OWGIS 2 Main Layers style).
 *
 * @param site site config
 * @param mainLayer currently selected main layer
 * @param lang language code
 * @returns HTML for 1–3 cascading selects
 */
function cascadedMainMenusHtml(site: SiteConfig, mainLayer: LayerConfig, lang: string): string {
  const mains = site.layers.filter((l) => l.kind === "main");
  const path = mainLayer.menuPath ?? [];
  const menuLabel = (id: string): string => {
    const entry = site.menus.find((m) => m.id === id);
    return entry?.labels[lang] ?? entry?.labels.EN ?? id;
  };

  const level0 = [...new Set(mains.map((l) => l.menuPath[0]).filter(Boolean))];
  const sel0 = path[0] ?? level0[0] ?? "";
  const level1 = [
    ...new Set(mains.filter((l) => l.menuPath[0] === sel0).map((l) => l.menuPath[1]).filter(Boolean)),
  ];
  const sel1 = path[1] ?? level1[0] ?? "";
  const level2 = [
    ...new Set(
      mains
        .filter((l) => l.menuPath[0] === sel0 && l.menuPath[1] === sel1)
        .map((l) => l.menuPath[2])
        .filter(Boolean),
    ),
  ];
  const sel2 = path[2] ?? level2[0] ?? "";

  const leafLayers = mains.filter((l) => {
    if (level2.length) {
      return l.menuPath[0] === sel0 && l.menuPath[1] === sel1 && l.menuPath[2] === sel2;
    }
    if (level1.length) {
      return l.menuPath[0] === sel0 && l.menuPath[1] === sel1;
    }
    return l.menuPath[0] === sel0;
  });

  const opts = (ids: string[], selected: string): string =>
    ids.map((id) => `<option value="${id}" ${id === selected ? "selected" : ""}>${menuLabel(id)}</option>`).join("");

  // If cascading menus are incomplete, fall back to a flat layer list.
  if (!level0.length) {
    return `<select id="main-layer" class="mainMenu" aria-label="Main layer">${mains
      .map((l) => {
        const label = l.labels[lang] ?? l.labels.EN ?? l.name;
        return `<option value="${l.id}" ${l.id === mainLayer.id ? "selected" : ""}>${label}</option>`;
      })
      .join("")}</select>`;
  }

  let html = `<select id="menu-l0" class="mainMenu" aria-label="Menu level 1">${opts(level0, sel0)}</select>`;
  if (level1.length) {
    html += `<select id="menu-l1" class="mainMenu" aria-label="Menu level 2">${opts(level1, sel1)}</select>`;
  }
  if (level2.length) {
    html += `<select id="menu-l2" class="mainMenu" aria-label="Menu level 3">${opts(level2, sel2)}</select>`;
  }
  // Hidden canonical layer id used by change handlers when path maps 1:1.
  const chosen = leafLayers.find((l) => l.id === mainLayer.id) ?? leafLayers[0];
  html += `<select id="main-layer" class="mainMenu ${leafLayers.length > 1 ? "" : "hidden"}" aria-label="Main layer">${leafLayers
    .map((l) => {
      const label = l.labels[lang] ?? l.labels.EN ?? l.name;
      return `<option value="${l.id}" ${l.id === chosen?.id ? "selected" : ""}>${label}</option>`;
    })
    .join("")}</select>`;
  return html;
}

/**
 * Build WMS STYLES for a plain (non-ncWMS) optional/overlay layer.
 *
 * @param layer layer config
 * @returns STYLES value (empty string uses the server default)
 */
function plainWmsStyle(layer: LayerConfig): string {
  if (!layer.style || layer.style === "default-scalar") {
    return "";
  }
  return layer.style;
}

/**
 * Build Optional Layers checkbox list HTML (OWGIS 2 optionalMenuParent).
 * Groups by the first menuPath segment (e.g. VECTOR → Countries / Coastline / …).
 *
 * @param site site config
 * @param lang language code
 * @param opacities current opacity by layer id
 * @returns HTML for the optional layers body, or empty string when none
 */
function optionalLayersHtml(
  site: SiteConfig,
  lang: string,
  opacities: Map<string, number>,
): string {
  const optionals = site.layers.filter((l) => l.kind === "optional");
  if (!optionals.length) {
    return "";
  }

  const menuLabel = (id: string): string => {
    const entry = site.menus.find((m) => m.id === id);
    return entry?.labels[lang] ?? entry?.labels.EN ?? id;
  };

  const layerRow = (layer: LayerConfig): string => {
    const label = layer.labels[lang] ?? layer.labels.EN ?? layer.name;
    const opacity = opacities.get(layer.id) ?? 1;
    const checked = layer.selected ? "checked" : "";
    return `<li class="opt-lay-row">
        <label class="opt-lay-label">
          <input type="checkbox" class="opt-lay-check" data-layer-id="${layer.id}" ${checked} />
          <span class="opt-lay-name">${label}</span>
        </label>
        <span class="opt-lay-opacity">
          <button type="button" class="buttonStyle opt-lay-minus" data-layer-id="${layer.id}" title="More transparent" aria-label="More transparent">−</button>
          <button type="button" class="buttonStyle opt-lay-plus" data-layer-id="${layer.id}" title="More opaque" aria-label="More opaque">+</button>
          <span class="opt-lay-op-val" data-layer-id="${layer.id}">${Math.round(opacity * 100)}%</span>
        </span>
      </li>`;
  };

  // Group by first menu path segment (OWGIS 2 Menu="VECTOR,COUNTRIES").
  const groups = new Map<string, LayerConfig[]>();
  const ungrouped: LayerConfig[] = [];
  for (const layer of optionals) {
    const groupId = layer.menuPath[0];
    if (!groupId) {
      ungrouped.push(layer);
      continue;
    }
    const list = groups.get(groupId) ?? [];
    list.push(layer);
    groups.set(groupId, list);
  }

  let html = `<ul class="opt-lay-list-root">`;
  let groupIdx = 0;
  for (const [groupId, layers] of groups) {
    groupIdx += 1;
    const ulId = `optUl${groupIdx}`;
    html += `<li class="opt-lay-title" data-toggle-ul="#${ulId}" role="button" tabindex="0">${menuLabel(groupId)}</li>`;
    html += `<ul class="opt-lay-list" id="${ulId}">${layers.map(layerRow).join("")}</ul>`;
  }
  if (ungrouped.length) {
    html += `<ul class="opt-lay-list opt-lay-list-flat">${ungrouped.map(layerRow).join("")}</ul>`;
  }
  html += `</ul>`;
  return html;
}

/**
 * Load WMS tiles through the CORS proxy (and keep PNG bytes intact).
 *
 * @param tile OpenLayers image tile
 * @param src absolute GetMap URL built by TileWMS
 * @param proxyBase proxy base path
 */
function proxiedTileLoad(tile: OlTile, src: string, proxyBase: string): void {
  const imageTile = tile as OlTile & { getImage: () => HTMLImageElement };
  const img = imageTile.getImage();
  img.crossOrigin = "anonymous";
  img.src = viaProxy(src, proxyBase);
}

/**
 * Load site config from session, draft, querystring, or baked public JSON.
 *
 * @returns site config
 */
async function resolveSiteConfig(): Promise<SiteConfig> {
  const params = new URLSearchParams(window.location.search);
  const configUrl = params.get("config");
  if (configUrl) {
    const response = await fetch(configUrl);
    if (!response.ok) {
      throw new Error(`Failed to load config ${configUrl}`);
    }
    return (await response.json()) as SiteConfig;
  }
  // Builder → viewer handoff uses sessionStorage only. Do not prefer the
  // longer-lived localStorage draft here — it permanently shadows site.json
  // updates (e.g. new optional layers) after an older "Build & Preview".
  if (params.get("draft") === "1" || params.get("draft") === "true") {
    return loadSiteDraft() ?? (await loadDefaultConfig());
  }
  return loadSiteFromSession() ?? (await loadDefaultConfig());
}

/**
 * Load default public config if present.
 *
 * @returns site config
 */
async function loadDefaultConfig(): Promise<SiteConfig> {
  const response = await fetch("./config/site.json");
  if (!response.ok) {
    throw new Error("No site config found. Open the Builder and click Build & Preview.");
  }
  return (await response.json()) as SiteConfig;
}

/**
 * Create a basemap tile layer from settings.
 *
 * @param kind basemap id
 * @returns OpenLayers tile layer
 */
function createBasemap(kind: string): TileLayer {
  switch (kind) {
    case "google":
      return new TileLayer({
        source: new XYZ({
          url: "https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
          crossOrigin: "anonymous",
        }),
      });
    case "googler":
      return new TileLayer({
        source: new XYZ({
          url: "https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
          crossOrigin: "anonymous",
        }),
      });
    case "osm":
    default:
      return new TileLayer({
        source: new OSM({ crossOrigin: "anonymous" }),
      });
  }
}

/**
 * Enumerate dates with data from ncWMS datesWithData structure.
 *
 * @param datesWithData nested year/month/day map
 * @returns ISO date strings yyyy-MM-dd
 */
function flattenDates(datesWithData: NcwmsLayerDetails["datesWithData"]): string[] {
  if (!datesWithData) {
    return [];
  }
  const out: string[] = [];
  for (const [year, months] of Object.entries(datesWithData)) {
    for (const [month, days] of Object.entries(months)) {
      for (const day of days) {
        const mm = String(Number(month) + 1).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        out.push(`${year}-${mm}-${dd}`);
      }
    }
  }
  return out.sort();
}

/**
 * Expand an animation timeString range into discrete ISO frames using hour list.
 *
 * @param timeString start/end[/period]
 * @param hours allowed time-of-day values like 19:00:00.000Z
 * @returns frame timestamps
 */
function expandFrames(timeString: string, hours: string[]): string[] {
  const parts = timeString.split("/");
  const start = new Date(parts[0]);
  const end = new Date(parts[1] ?? parts[0]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [parts[0]];
  }
  const frames: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime()) {
    const tod = cursor.toISOString().split("T")[1];
    if (!hours.length || hours.includes(tod)) {
      frames.push(cursor.toISOString());
    }
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return frames.length ? frames : [start.toISOString()];
}

/**
 * Main viewer bootstrap.
 *
 * @param root host element
 */
async function startViewer(root: HTMLElement): Promise<void> {
  const mobile = resolveMobileMode();
  applyMobileDocument(mobile);
  watchMobileBreakpoint(mobile);

  root.innerHTML = `
    <section class="topMenu" id="toolbar"></section>
    <h1 class="mapTitle defShadow" id="mapTitle"></h1>
    <div id="map"></div>
    <canvas id="currentsCanvas" aria-hidden="true"></canvas>
    <div id="draggable-container">
      <div id="panels"></div>
    </div>
    <div id="div-palette-horbar" class="hidden">
      <canvas id="canvas-palette-horbar" aria-label="Color scale"></canvas>
    </div>
    <div id="minimizedWindowsContainer"></div>
    <div id="popup" class="ol-popup" style="display:none">
      <a href="#" id="popup-closer" class="ol-popup-closer" title="Close" aria-label="Close">✖</a>
      <div id="popup-content"></div>
    </div>
    <div id="plotModal" class="plot-modal hidden" role="dialog" aria-modal="true">
      <div class="plot-modal-dialog">
        <div class="plot-modal-header">
          <h5 id="plotModalTitle">Plot</h5>
          <div class="plot-modal-actions">
            <button type="button" id="plotModalDownload" class="plot-modal-download" title="Download PNG" aria-label="Download PNG" disabled>Download</button>
            <button type="button" id="plotModalClose" class="plot-modal-close" title="Close" aria-label="Close">✖</button>
          </div>
        </div>
        <div class="plot-modal-body">
          <p class="muted" id="plotModalStatus">Loading…</p>
          <div id="plotModalChart" class="plot-modal-chart hidden" role="img" aria-label="Interactive plot"></div>
          <img id="plotModalImg" alt="ncWMS plot" />
        </div>
      </div>
    </div>`;

  const toolbar = root.querySelector("#toolbar") as HTMLElement;
  const panels = root.querySelector("#panels") as HTMLElement;
  const popup = root.querySelector("#popup") as HTMLElement;
  const popupContent = root.querySelector("#popup-content") as HTMLElement;
  const popupCloser = root.querySelector("#popup-closer") as HTMLAnchorElement;
  const plotModal = root.querySelector("#plotModal") as HTMLElement;
  const plotModalTitle = root.querySelector("#plotModalTitle") as HTMLElement;
  const plotModalImg = root.querySelector("#plotModalImg") as HTMLImageElement;
  const plotModalChart = root.querySelector("#plotModalChart") as HTMLElement;
  const plotModalStatus = root.querySelector("#plotModalStatus") as HTMLElement;
  const plotModalDownload = root.querySelector("#plotModalDownload") as HTMLButtonElement;
  const mapTitle = root.querySelector("#mapTitle") as HTMLElement;
  const currentsCanvas = root.querySelector("#currentsCanvas") as HTMLCanvasElement;

  /** Proxied URL of the plot currently shown (image mode download). */
  let plotModalSrc = "";
  /** Whether the modal is showing an ECharts chart (vs static image). */
  let plotModalIsChart = false;

  let mobileChrome: MobileChrome | null = null;

  const site = await resolveSiteConfig();
  let mainLayer = getSelectedMainLayer(site);
  if (!mainLayer) {
    throw new Error("No main layer in site config");
  }

  let details = await loadLayerDetails(
    mainLayer,
    site.settings,
    site.bakedDetails?.[mainLayer.id],
  );

  const projection = "EPSG:3857";
  const center = fromLonLat([site.settings.mapCenter.lon, site.settings.mapCenter.lat]);

  const basemap = createBasemap(site.settings.backgroundLayer);
  const wmsSource = new TileWMS({
    url: mainLayer.server,
    crossOrigin: "anonymous",
    params: {
      LAYERS: mainLayer.name,
      STYLES: `${mainLayer.style}/${mainLayer.palette}`,
      TRANSPARENT: true,
      FORMAT: mainLayer.format,
      COLORSCALERANGE: details.scaleRange
        ? `${details.scaleRange[0]},${details.scaleRange[1]}`
        : undefined,
      NUMCOLORBANDS: 250,
      VERSION: "1.3.0",
    },
    tileLoadFunction: (tile, src) => {
      proxiedTileLoad(tile, src, site.settings.proxyBase);
    },
  });
  const dataLayer = new TileLayer({
    source: wmsSource,
    opacity: 0.85,
    // Transparent WMS tiles must not fade in over interim/stale tiles
    // (otherwise the previous ELEVATION/TIME frame remains visible underneath).
    transition: 0,
  } as ConstructorParameters<typeof TileLayer<TileWMS>>[0]);

  /** Optional GeoServer / vector WMS overlays keyed by layer config id. */
  const optionalOlLayers = new Map<string, TileLayer<TileWMS>>();
  /** Opacity for each optional overlay (OWGIS 2 ± transparency). */
  const optionalOpacity = new Map<string, number>();

  for (const layer of site.layers.filter((l) => l.kind === "optional")) {
    const source = new TileWMS({
      url: layer.server,
      crossOrigin: "anonymous",
      params: {
        LAYERS: layer.name,
        STYLES: plainWmsStyle(layer),
        TRANSPARENT: true,
        FORMAT: layer.format,
        VERSION: "1.3.0",
      },
      tileLoadFunction: (tile, src) => {
        proxiedTileLoad(tile, src, site.settings.proxyBase);
      },
    });
    const olLayer = new TileLayer({
      source,
      opacity: 1,
      visible: layer.selected,
      transition: 0,
    } as ConstructorParameters<typeof TileLayer<TileWMS>>[0]);
    optionalOlLayers.set(layer.id, olLayer);
    optionalOpacity.set(layer.id, 1);
  }

  const map = new OlMap({
    target: "map",
    layers: [basemap, dataLayer, ...optionalOlLayers.values()],
    view: new View({
      projection,
      center,
      zoom: site.settings.zoom,
      maxZoom: site.settings.zoomLevels,
    }),
    controls: defaultControls().extend([
      new ScaleLine(),
      new MousePosition({
        coordinateFormat: createStringXY(4),
        projection: "EPSG:4326",
        className: "ol-mouse-position layersLonLat",
        placeholder: "lon, lat",
      }),
    ]),
  });

  const olPopup = new Overlay({
    element: popup,
    autoPan: { animation: { duration: 250 } },
    positioning: "bottom-center",
    offset: [0, -12],
    stopEvent: true,
  });
  map.addOverlay(olPopup);

  /**
   * Hide the identify popup overlay.
   */
  function closePopup(): void {
    popup.style.display = "none";
    olPopup.setPosition(undefined);
  }

  popupCloser.addEventListener("click", (event) => {
    event.preventDefault();
    closePopup();
  });

  /**
   * Build a safe download filename from the plot title.
   *
   * @param title modal title
   * @returns filename ending in .png
   */
  function plotDownloadFilename(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return `${slug || "owgis3-plot"}.png`;
  }

  /**
   * Reset plot modal media to a loading state.
   *
   * @param title modal title
   */
  function preparePlotModal(title: string): void {
    plotModalTitle.textContent = title;
    plotModalStatus.textContent = "Loading…";
    plotModalStatus.classList.remove("hidden");
    plotModalImg.removeAttribute("src");
    plotModalImg.classList.add("hidden");
    plotModalChart.classList.add("hidden");
    plotModalChart.innerHTML = "";
    disposePlotChart();
    plotModalDownload.disabled = true;
    plotModalSrc = "";
    plotModalIsChart = false;
    plotModal.classList.remove("hidden");
  }

  /**
   * Open the plot modal with a static ncWMS image (transect / fallback).
   *
   * @param title modal title
   * @param absoluteUrl remote WMS URL
   */
  function openPlotModal(title: string, absoluteUrl: string): void {
    preparePlotModal(title);
    const src = viaProxy(absoluteUrl, site.settings.proxyBase);
    const showImg = (): void => {
      plotModalStatus.classList.add("hidden");
      plotModalImg.classList.remove("hidden");
      plotModalSrc = src;
      plotModalDownload.disabled = false;
    };
    plotModalImg.onload = showImg;
    plotModalImg.onerror = () => {
      plotModalStatus.textContent = "Failed to load plot from ncWMS.";
      plotModalImg.classList.add("hidden");
      plotModalDownload.disabled = true;
      plotModalSrc = "";
    };
    plotModalImg.src = src;
    if (plotModalImg.complete && plotModalImg.naturalWidth > 0) {
      showImg();
    }
  }

  /**
   * Fetch ncWMS CSV and render an interactive ECharts plot (OWGIS 2 style).
   *
   * @param kind time-series or vertical-profile
   * @param title modal title
   * @param absoluteUrl GetTimeseries / GetVerticalProfile CSV URL
   */
  async function openDynamicChartModal(
    kind: "timeseries" | "profile",
    title: string,
    absoluteUrl: string,
  ): Promise<void> {
    preparePlotModal(title);
    try {
      const response = await fetch(viaProxy(absoluteUrl, site.settings.proxyBase));
      if (!response.ok) {
        throw new Error(`Plot request failed (${response.status})`);
      }
      const csv = await response.text();
      if (/<\s*html|ExceptionReport|ServiceException/i.test(csv)) {
        throw new Error("ncWMS returned an error instead of CSV data.");
      }
      const series = parseNcwmsCsv(csv);
      if (!series) {
        throw new Error("No plottable values in the CSV response.");
      }
      plotModalStatus.classList.add("hidden");
      plotModalChart.classList.remove("hidden");
      plotModalIsChart = true;
      if (kind === "timeseries") {
        renderTimeSeriesChart(plotModalChart, series, "Time Series", details.units);
      } else {
        renderVerticalProfileChart(
          plotModalChart,
          series,
          "Vertical Profile",
          details.units,
        );
      }
      plotModalDownload.disabled = false;
      window.setTimeout(() => {
        resizePlotChart();
      }, 0);
    } catch (error) {
      plotModalStatus.textContent =
        error instanceof Error ? error.message : String(error);
      plotModalDownload.disabled = true;
    }
  }

  /**
   * Download the plot currently shown (chart PNG or static image).
   */
  async function downloadPlotModalImage(): Promise<void> {
    plotModalDownload.disabled = true;
    try {
      if (plotModalIsChart) {
        const dataUrl = chartToPngDataUrl();
        if (!dataUrl) {
          throw new Error("Chart is not ready to download.");
        }
        const anchor = document.createElement("a");
        anchor.href = dataUrl;
        anchor.download = plotDownloadFilename(plotModalTitle.textContent ?? "plot");
        anchor.click();
        return;
      }
      const src = plotModalSrc || plotModalImg.currentSrc || plotModalImg.src;
      if (!src) {
        return;
      }
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = plotDownloadFilename(plotModalTitle.textContent ?? "plot");
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      plotModalDownload.disabled = !(plotModalSrc || plotModalIsChart);
    }
  }

  /**
   * Hide the plot modal and dispose chart resources.
   */
  function closePlotModal(): void {
    plotModal.classList.add("hidden");
    plotModalImg.removeAttribute("src");
    plotModalChart.classList.add("hidden");
    plotModalChart.innerHTML = "";
    disposePlotChart();
    plotModalDownload.disabled = true;
    plotModalSrc = "";
    plotModalIsChart = false;
  }

  root.querySelector("#plotModalClose")?.addEventListener("click", () => {
    closePlotModal();
  });
  plotModalDownload.addEventListener("click", () => {
    void downloadPlotModalImage();
  });
  plotModal.addEventListener("click", (event) => {
    if (event.target === plotModal) {
      closePlotModal();
    }
  });
  window.addEventListener("resize", () => {
    if (!plotModal.classList.contains("hidden") && plotModalIsChart) {
      resizePlotChart();
    }
  });

  // Grid layout may resolve after Map construction; force a size sync.
  const syncMapSize = (): void => {
    map.updateSize();
  };

  if (mobile) {
    mobileChrome = new MobileChrome(root, {
      onLayoutChange: syncMapSize,
      hasCalendars: () => flattenDates(details.datesWithData).length > 0,
    });
    mobileChrome.mount();
  }
  window.addEventListener("resize", syncMapSize);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(syncMapSize, 300);
  });
  requestAnimationFrame(() => {
    syncMapSize();
    requestAnimationFrame(syncMapSize);
  });

  const cesium3d = createCesiumController(map);

  const drawSource = new VectorSource();
  const transectStyle = new Style({
    fill: new Fill({ color: "rgba(255, 255, 255, 0.2)" }),
    stroke: new Stroke({ color: "#ffcc33", width: 2 }),
    image: new CircleStyle({
      radius: 7,
      fill: new Fill({ color: "#ffcc33" }),
    }),
  });
  const drawLayer = new VectorLayer({
    source: drawSource,
    style: transectStyle,
    zIndex: 50,
  });
  map.addLayer(drawLayer);
  let drawInteraction: Draw | null = null;
  /** When true, map clicks draw a transect instead of GetFeatureInfo (OWGIS 2). */
  let transectActive = false;

  let currentTime = details.nearestTimeIso ?? "";
  let currentElevation: string | number | undefined = details.zaxis?.values?.[0];
  let minPal = Number(details.scaleRange?.[0] ?? 0);
  let maxPal = Number(details.scaleRange?.[1] ?? 1);
  let palette = mainLayer.palette || details.defaultPalette || "default";
  let hours: string[] = [];
  let animFrames: string[] = [];
  let animIndex = 0;
  let animTimer: number | undefined;
  let animPlaying = false;
  /** Frame interval in ms (OWGIS 2 starts at 1000 → 1.0 fps). */
  let animSpeedMs = 1000;
  let streamlines: StreamlinesController | null = null;
  let startCal: MonthCalendar | null = null;
  let endCal: MonthCalendar | null = null;
  /** Monotonic token so overlapping main-layer switches keep only the latest. */
  let layerSelectGen = 0;
  /** Monotonic token so overlapping colorbar image loads keep only the latest. */
  let colorbarDrawGen = 0;

  /**
   * Push TIME / ELEVATION / COLORSCALERANGE / STYLES into the WMS source.
   */
  function refreshWmsParams(): void {
    const params: Record<string, string | number | boolean> = {
      LAYERS: mainLayer!.name,
      STYLES: `${mainLayer!.style}/${palette}`,
      TRANSPARENT: true,
      FORMAT: mainLayer!.format,
      COLORSCALERANGE: `${minPal},${maxPal}`,
      NUMCOLORBANDS: 250,
    };
    if (currentTime) {
      params.TIME = currentTime;
    }
    if (currentElevation !== undefined && currentElevation !== "") {
      params.ELEVATION = currentElevation;
    }
    wmsSource.updateParams(params);
    const legend = panels.querySelector("#legend-img") as HTMLImageElement | null;
    if (legend) {
      legend.src = viaProxy(legendUrl(mainLayer!, palette), site.settings.proxyBase);
    }
    updateHorizontalPalette();
    updateMapTitleSub();
    if (mainLayer?.overlayStreamlines) {
      streamlines?.updateParams({
        time: currentTime || undefined,
        elevation: currentElevation,
        proxyBase: site.settings.proxyBase,
      });
    } else {
      streamlines?.stop();
    }
  }

  /**
   * Draw the OWGIS 2–style bottom colorbar: black units cap + palette strip +
   * white tick labels overlaid on a rounded canvas.
   */
  function updateHorizontalPalette(): void {
    const wrap = root.querySelector("#div-palette-horbar") as HTMLElement | null;
    const canvas = root.querySelector("#canvas-palette-horbar") as HTMLCanvasElement | null;
    if (!wrap || !canvas) {
      return;
    }
    if (!mainLayer?.ncWms) {
      wrap.classList.add("hidden");
      return;
    }

    const barWidth = Math.ceil(window.innerWidth * (mobile ? 0.85 : 0.4));
    const barHeight = 15;
    const spaceForUnits = 40;
    const absoluteUrl =
      `${mainLayer.server}?REQUEST=GetLegendGraphic` +
      `&LAYER=${encodeURIComponent(mainLayer.name)}` +
      `&PALETTE=${encodeURIComponent(palette)}` +
      `&COLORBARONLY=true&VERTICAL=false` +
      `&WIDTH=${barWidth}&HEIGHT=${barHeight}` +
      `&NUMCOLORBANDS=250&COLORSCALERANGE=${minPal},${maxPal}`;
    const url = viaProxy(absoluteUrl, site.settings.proxyBase);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    canvas.width = barWidth + spaceForUnits;
    canvas.height = barHeight;
    wrap.style.width = `${canvas.width}px`;
    wrap.style.height = `${barHeight}px`;
    wrap.classList.remove("hidden");

    const imageObj = new Image();
    imageObj.crossOrigin = "anonymous";
    const token = ++colorbarDrawGen;

    imageObj.onload = (): void => {
      if (token !== colorbarDrawGen) {
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imageObj, spaceForUnits, 0, barWidth, barHeight);

      const pixBelowText = 3;
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `${barHeight - pixBelowText}px Arial`;
      ctx.textBaseline = "alphabetic";
      const units = details.units ?? "";
      ctx.fillText(units, 2, Math.ceil(barHeight - pixBelowText));

      const minVal = Number(minPal);
      const maxVal = Number(maxPal);
      const span = maxVal - minVal || 1;
      const ticks = niceTicks(minVal, maxVal, 8);
      for (const number of ticks) {
        const x = ((number - minVal) / span) * barWidth + spaceForUnits - 14;
        ctx.fillText(formatColorbarTick(number), x, Math.ceil(barHeight - pixBelowText));
      }
    };
    imageObj.onerror = (): void => {
      if (token === colorbarDrawGen) {
        wrap.classList.add("hidden");
      }
    };
    imageObj.src = url;
  }

  /**
   * Update the subtitle under the map title (time + depth).
   */
  function updateMapTitleSub(): void {
    const sub = root.querySelector("#mapTitleSub");
    if (!sub) {
      return;
    }
    const timeLabel = currentTime ? currentTime.replace(".000Z", "").replace("T", " ") : "";
    const depthLabel =
      currentElevation !== undefined && currentElevation !== ""
        ? ` Depth ${currentElevation} ${details.zaxis?.units ?? ""}`
        : "";
    sub.textContent = `${timeLabel}${depthLabel}`.trim();
  }

  /**
   * Rebuild top frosted toolbar (OWGIS 2–style tools).
   */
  function renderToolbar(): void {
    const lang = site.settings.defaultLanguage;
    const currentBg = site.settings.backgroundLayer;
    const bgItems = site.settings.availableBackgroundLayers
      .map((id, i) => {
        const name = site.settings.availableBackgroundNames[i] ?? id;
        const selected = id === currentBg ? "selected" : "";
        return `<li role="option" class="basemap-option ${selected}" data-value="${id}" title="${name}" aria-selected="${id === currentBg}">
            <img src="/images/backlayers/${id}.png" alt="${name}" width="44" height="33" />
            <span class="basemap-option-label">${name}</span>
          </li>`;
      })
      .join("");

    const titleText = mainLayer!.labels[lang] ?? mainLayer!.labels.EN ?? mainLayer!.name;
    mapTitle.innerHTML = `${titleText}
      <span class="mapTitleSub" id="mapTitleSub"></span>`;
    updateMapTitleSub();
    mobileChrome?.setTitle(titleText);

    const toolsHtml = `
      <a class="brand-link" href="https://owgis.org" target="_blank" rel="noreferrer" title="OWGIS">
        <img src="/images/Logos/owgis.png" alt="OWGIS" height="20" />
      </a>
      <ul class="tool-cluster">
        <li class="buttonLook basemap-picker" title="Background layer">
          <button type="button" id="btn-basemap" class="basemap-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="Basemap">
            <img id="basemap-thumb" src="/images/th-large.png" alt="" width="20" height="20" />
          </button>
          <ul id="basemap-menu" class="basemap-menu hidden" role="listbox">${bgItems}</ul>
        </li>
        <li class="buttonLook opacity-control" title="Transparency" id="transParent">
          <button type="button" id="btn-trans-down" title="More transparent" aria-label="More transparent">${TOOL_ICONS.minus}</button>
          <span class="opacity-icon" title="Opacity">${TOOL_ICONS.eye}</span>
          <button type="button" id="btn-trans-up" title="More opaque" aria-label="More opaque">${TOOL_ICONS.plus}</button>
        </li>
        <li class="${details.zaxis?.values?.length ? "" : "hidden"}">${iconButton("btn-toggle-elev", "Depth / elevation", TOOL_ICONS.depth)}</li>
        <li>${iconButton("btn-toggle-palettes", "Palettes", TOOL_ICONS.tint)}</li>
        <li>${iconButton("btn-transect-top", "Transect", TOOL_ICONS.transect)}</li>
        <li>${iconButton("btn-toggle-3d", "3D view", TOOL_ICONS.globe)}</li>
        <li>${iconButton("btn-reset", "Reset view", TOOL_ICONS.refresh)}</li>
        <li class="${mainLayer!.overlayStreamlines ? "" : "hidden"}">${iconButton("btn-toggle-streams", "Streamlines", TOOL_ICONS.streams)}</li>
      </ul>
      <span class="spacer"></span>
      <span class="status-line" id="status-line"></span>
      <a class="buttonStyle icon-btn" href="./index.html" title="Open builder" aria-label="Open builder">${TOOL_ICONS.builder}</a>
    `;

    const mobileToolsHtml = `
      <ul class="mob-tool-list">
        <li class="mob-tool-block basemap-picker" title="Background layer">
          <span class="mob-tool-label">Basemap</span>
          <button type="button" id="btn-basemap" class="basemap-toggle" aria-haspopup="listbox" aria-expanded="false" aria-label="Basemap">
            <img id="basemap-thumb" src="/images/th-large.png" alt="" width="20" height="20" />
          </button>
          <ul id="basemap-menu" class="basemap-menu hidden" role="listbox">${bgItems}</ul>
        </li>
        <li class="mob-tool-block opacity-control" id="transParent">
          <span class="mob-tool-label">Transparency</span>
          <div class="mob-opacity-row">
            <button type="button" id="btn-trans-down" title="More transparent" aria-label="More transparent">${TOOL_ICONS.minus}</button>
            <span class="opacity-icon" title="Opacity">${TOOL_ICONS.eye}</span>
            <button type="button" id="btn-trans-up" title="More opaque" aria-label="More opaque">${TOOL_ICONS.plus}</button>
          </div>
        </li>
        <li class="${details.zaxis?.values?.length ? "" : "hidden"}">
          <button type="button" class="mob-tool-link" id="btn-toggle-elev">Depth / elevation</button>
        </li>
        <li><button type="button" class="mob-tool-link" id="btn-toggle-palettes">Palettes</button></li>
        <li><button type="button" class="mob-tool-link" id="btn-transect-top">Transect</button></li>
        <li><button type="button" class="mob-tool-link" id="btn-toggle-3d">3D view</button></li>
        <li><button type="button" class="mob-tool-link" id="btn-reset">Reset view</button></li>
        <li class="${mainLayer!.overlayStreamlines ? "" : "hidden"}">
          <button type="button" class="mob-tool-link" id="btn-toggle-streams">Streamlines</button>
        </li>
        <li><button type="button" class="mob-tool-link" id="btn-toggle-tools">Identify / export</button></li>
        <li><a class="mob-tool-link" href="./index.html">Open builder</a></li>
      </ul>
      <p class="mob-status-line muted" id="status-line"></p>
    `;

    const host = mobile ? mobileChrome?.toolsBody() : toolbar;
    if (!host) {
      return;
    }
    if (mobile) {
      toolbar.innerHTML = "";
      host.innerHTML = mobileToolsHtml;
    } else {
      toolbar.innerHTML = toolsHtml;
    }

    const basemapBtn = host.querySelector<HTMLButtonElement>("#btn-basemap");
    const basemapMenu = host.querySelector<HTMLUListElement>("#basemap-menu");
    const basemapPicker = host.querySelector<HTMLElement>(".basemap-picker");
    let onOutside: ((ev: MouseEvent) => void) | null = null;

    /**
     * Close the basemap thumbnail dropdown.
     */
    const closeBasemapMenu = (): void => {
      basemapMenu?.classList.add("hidden");
      basemapPicker?.classList.remove("open");
      basemapBtn?.setAttribute("aria-expanded", "false");
      if (onOutside) {
        document.removeEventListener("mousedown", onOutside, true);
        onOutside = null;
      }
    };

    /**
     * Open the basemap thumbnail dropdown.
     */
    const openBasemapMenu = (): void => {
      basemapMenu?.classList.remove("hidden");
      basemapPicker?.classList.add("open");
      basemapBtn?.setAttribute("aria-expanded", "true");
      window.setTimeout(() => {
        onOutside = (ev: MouseEvent): void => {
          if (
            basemapPicker &&
            ev.target instanceof Node &&
            basemapPicker.contains(ev.target)
          ) {
            return;
          }
          closeBasemapMenu();
        };
        document.addEventListener("mousedown", onOutside, true);
      }, 0);
    };

    /**
     * Apply a background layer id and refresh the picker UI.
     *
     * @param kind basemap id (osm, google, googler, …)
     */
    const setBasemap = (kind: string): void => {
      site.settings.backgroundLayer = kind;
      map.getLayers().setAt(0, createBasemap(kind));
      basemapMenu?.querySelectorAll<HTMLElement>(".basemap-option").forEach((opt) => {
        const on = opt.dataset.value === kind;
        opt.classList.toggle("selected", on);
        opt.setAttribute("aria-selected", String(on));
      });
      closeBasemapMenu();
    };

    basemapBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isHidden = basemapMenu?.classList.contains("hidden") ?? true;
      if (isHidden) {
        openBasemapMenu();
      } else {
        closeBasemapMenu();
      }
    });
    basemapMenu?.querySelectorAll<HTMLElement>(".basemap-option").forEach((opt) => {
      opt.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const kind = opt.dataset.value;
        if (kind) {
          setBasemap(kind);
        }
      });
    });
    if (!(window as unknown as { __owgisBasemapEsc?: boolean }).__owgisBasemapEsc) {
      (window as unknown as { __owgisBasemapEsc?: boolean }).__owgisBasemapEsc = true;
      document.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") {
          return;
        }
        const picker = document.querySelector(".basemap-picker.open");
        if (!picker) {
          return;
        }
        picker.classList.remove("open");
        picker.querySelector("#basemap-menu")?.classList.add("hidden");
        picker.querySelector("#btn-basemap")?.setAttribute("aria-expanded", "false");
      });
    }

    host.querySelector("#btn-reset")?.addEventListener("click", () => {
      map.getView().animate({ center, zoom: site.settings.zoom, duration: 400 });
      if (mobile) {
        mobileChrome?.closeAll();
      }
    });

    host.querySelector("#btn-toggle-3d")?.addEventListener("click", () => {
      const btn = host.querySelector("#btn-toggle-3d") as HTMLElement | null;
      btn?.classList.add("beenUsed");
      setStatus("Loading 3D…");
      void cesium3d
        .toggle()
        .then((enabled) => {
          btn?.classList.toggle("beenUsed", enabled);
          setStatus(enabled ? "3D globe on" : "2D map on");
          syncMapSize();
        })
        .catch((error: unknown) => {
          btn?.classList.remove("beenUsed");
          setStatus(error instanceof Error ? error.message : String(error));
        });
    });

    const bumpOpacity = (delta: number): void => {
      const next = Math.min(1, Math.max(0.1, dataLayer.getOpacity() + delta));
      dataLayer.setOpacity(next);
      setStatus(`Opacity ${next.toFixed(2)}`);
    };
    host.querySelector("#btn-trans-down")?.addEventListener("click", () => bumpOpacity(-0.1));
    host.querySelector("#btn-trans-up")?.addEventListener("click", () => bumpOpacity(0.1));

    const togglePanel = (id: string, btnSelector: string): void => {
      if (mobile) {
        mobileChrome?.openPanelSheet(id);
        return;
      }
      const panel = panels.querySelector(`#${id}`) as HTMLElement | null;
      const btn = toolbar.querySelector(btnSelector) as HTMLElement | null;
      if (!panel) {
        return;
      }
      const show = panel.classList.contains("hidden") || panel.classList.contains("minimized");
      panel.classList.toggle("hidden", !show);
      panel.classList.remove("minimized");
      btn?.classList.toggle("beenUsed", show);
      const tab = root.querySelector(`[data-restore="${id}"]`);
      tab?.classList.add("hidden");
    };

    host.querySelector("#btn-toggle-palettes")?.addEventListener("click", () => {
      togglePanel("paletteWindowColorRange", "#btn-toggle-palettes");
      const colorRange = panels.querySelector("#paletteWindowColorRange");
      const picker = panels.querySelector("#palettes-div") as HTMLElement | null;
      if (!picker || !colorRange) {
        return;
      }
      const open =
        !colorRange.classList.contains("hidden")
        && !colorRange.classList.contains("minimized");
      if (mobile) {
        return;
      }
      picker.classList.toggle("hidden", !open);
      picker.classList.toggle("minimized", !open);
      if (open && !picker.style.left) {
        picker.style.left = "42%";
        picker.style.top = "180px";
      }
    });
    host.querySelector("#btn-toggle-elev")?.addEventListener("click", () => {
      if (!(details.zaxis?.values?.length)) {
        return;
      }
      togglePanel("zaxis_selector_parent", "#btn-toggle-elev");
    });
    host.querySelector("#btn-toggle-streams")?.addEventListener("click", () => {
      togglePanel("currentsControlsContainer", "#btn-toggle-streams");
    });
    host.querySelector("#btn-toggle-tools")?.addEventListener("click", () => {
      togglePanel("toolsPanel", "#btn-toggle-tools");
    });
    host.querySelector("#btn-transect-top")?.addEventListener("click", () => {
      if (mobile) {
        mobileChrome?.openPanelSheet("toolsPanel");
        window.setTimeout(() => {
          toggleTransect();
        }, 0);
        return;
      }
      // Desktop: toggle draw mode immediately (OWGIS 2) — do not require Tools panel.
      toggleTransect();
    });

    syncTransectButtons(transectActive);
  }

  const PANEL_TOOLBAR_BTNS: Record<string, string> = {
    paletteWindowColorRange: "#btn-toggle-palettes",
    zaxis_selector_parent: "#btn-toggle-elev",
    currentsControlsContainer: "#btn-toggle-streams",
    toolsPanel: "#btn-toggle-tools",
  };

  document.addEventListener("owgis3:panel-hidden", ((event: CustomEvent<{ id: string }>) => {
    const sel = PANEL_TOOLBAR_BTNS[event.detail.id];
    if (sel) {
      root.querySelector(sel)?.classList.remove("beenUsed");
    }
    if (event.detail.id === "paletteWindowColorRange") {
      const picker = panels.querySelector("#palettes-div");
      picker?.classList.add("hidden", "minimized");
    }
  }) as EventListener);

  /**
   * Fit the map to a layer bbox.
   *
   * @param layer layer config
   */
  function fitLayer(layer: LayerConfig): void {
    const extent = transformExtent(layer.bbox, "EPSG:4326", projection);
    map.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 8, duration: 400 });
  }

  /**
   * Load hour options for a day into a select element.
   *
   * @param day yyyy-MM-dd
   * @param selectId DOM id of the select
   * @param preferHour optional hour suffix to select
   * @param preferEdge when no preferHour, pick "first" or "last" (default last)
   */
  async function loadHoursIntoSelect(
    day: string,
    selectId: string,
    preferHour?: string,
    preferEdge: "first" | "last" = "last",
  ): Promise<string[]> {
    const hourSelect = root.querySelector(`#${selectId}`) as HTMLSelectElement | null;
    if (!mainLayer?.ncWms || !hourSelect) {
      return [];
    }
    try {
      const json = await fetchWmsJson<{ timesteps: string[] }>(
        timestepsUrl(mainLayer, day),
        site.settings.proxyBase,
      );
      const steps = json.timesteps ?? [];
      let preferred: string | undefined;
      if (preferHour && steps.includes(preferHour)) {
        preferred = preferHour;
      } else if (preferEdge === "first") {
        preferred = steps[0];
      } else {
        preferred = steps[steps.length - 1] ?? steps[0];
      }
      hourSelect.innerHTML = steps
        .map((h) => {
          const selected = h === preferred ? "selected" : "";
          return `<option value="${h}" ${selected}>${h.replace(".000Z", "")}</option>`;
        })
        .join("");
      hourSelect.parentElement?.classList.toggle("hidden", steps.length === 0);
      return steps;
    } catch (error) {
      hourSelect.innerHTML = "";
      setStatus(error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  /**
   * Load timesteps for the currently selected date (start calendar / map TIME).
   * Start hour defaults to the first available timestep; end hour to the last.
   */
  async function loadHoursForCurrentDate(): Promise<void> {
    const day = currentTime
      ? currentTime.slice(0, 10)
      : flattenDates(details.datesWithData)[0];
    if (!day) {
      hours = [];
      return;
    }
    hours = await loadHoursIntoSelect(day, "startTimeCalendar", undefined, "first");
    // Mirror into hidden #hour for any legacy listeners.
    const legacy = root.querySelector("#hour") as HTMLSelectElement | null;
    const startSel = root.querySelector("#startTimeCalendar") as HTMLSelectElement | null;
    if (legacy && startSel) {
      legacy.innerHTML = startSel.innerHTML;
      legacy.value = startSel.value;
    }
    const endDay = endCal?.getDate() ?? day;
    await loadHoursIntoSelect(endDay, "endTimeCalendar", undefined, "last");
    currentTime = timeFromStartControls() || currentTime;
    await refreshAnimOptions();
  }

  /**
   * Build current TIME from start calendar + start hour select.
   *
   * @returns ISO timestamp or empty
   */
  function timeFromStartControls(): string {
    const day = startCal?.getDate()
      ?? (root.querySelector("#date") as HTMLInputElement | null)?.value
      ?? currentTime.slice(0, 10);
    const hour = (root.querySelector("#startTimeCalendar") as HTMLSelectElement | null)?.value
      ?? hours[0]
      ?? "00:00:00.000Z";
    return day ? `${day}T${hour}` : "";
  }

  /**
   * Build start/end TIME bounds from the dual calendars and hour selects.
   *
   * @returns start and end ISO timestamps
   */
  function animationBounds(): { start: string; end: string } | null {
    const startDay = startCal?.getDate() ?? currentTime.slice(0, 10);
    const endDay = endCal?.getDate() ?? startDay;
    const startHour = (root.querySelector("#startTimeCalendar") as HTMLSelectElement | null)?.value
      ?? hours[0];
    const endHour = (root.querySelector("#endTimeCalendar") as HTMLSelectElement | null)?.value
      ?? hours[hours.length - 1]
      ?? startHour;
    if (!startDay || !startHour || !endHour) {
      return null;
    }
    return {
      start: `${startDay}T${startHour}`,
      end: `${endDay}T${endHour}`,
    };
  }

  /**
   * Create OWGIS2-style start/end month calendars in the Calendars panel.
   */
  function initDualCalendars(): void {
    const startHost = panels.querySelector("#cal-start") as HTMLElement | null;
    const endHost = panels.querySelector("#cal-end") as HTMLElement | null;
    if (!startHost || !endHost) {
      startCal = null;
      endCal = null;
      return;
    }
    const available = availableDateSet(details.datesWithData);
    const sorted = [...available].sort();
    const startDay = (currentTime || sorted[0] || "").slice(0, 10) || sorted[0];
    const endDay = sorted[sorted.length - 1] ?? startDay;
    if (!startDay) {
      startCal = null;
      endCal = null;
      return;
    }
    const minDate = sorted[0];
    const maxDate = sorted[sorted.length - 1];

    startCal = new MonthCalendar(startHost, {
      availableDates: available,
      selected: startDay,
      minDate,
      maxDate,
      onSelect: (iso) => {
        void (async () => {
          // New start day → first available hour for that day.
          hours = await loadHoursIntoSelect(iso, "startTimeCalendar", undefined, "first");
          const hiddenDate = panels.querySelector("#date") as HTMLSelectElement | null;
          if (hiddenDate) {
            hiddenDate.innerHTML = `<option value="${iso}" selected>${iso}</option>`;
            hiddenDate.value = iso;
          }
          currentTime = timeFromStartControls();
          refreshWmsParams();
          await refreshAnimOptions();
        })();
      },
    });

    endCal = new MonthCalendar(endHost, {
      availableDates: available,
      selected: endDay,
      minDate,
      maxDate,
      onSelect: (iso) => {
        void (async () => {
          // New end day → last available hour for that day.
          await loadHoursIntoSelect(iso, "endTimeCalendar", undefined, "last");
          await refreshAnimOptions();
        })();
      },
    });
  }

  /**
   * Update status text in the toolbar.
   *
   * @param text status message
   */
  function setStatus(text: string): void {
    const el = root.querySelector("#status-line");
    if (el) {
      el.textContent = text;
    }
  }

  /**
   * Sync transect toolbar / tools-panel button highlight.
   *
   * @param on whether transect mode is active
   */
  function syncTransectButtons(on: boolean): void {
    root.querySelector("#btn-transect-top")?.classList.toggle("beenUsed", on);
    root.querySelector("#btn-transect")?.classList.toggle("beenUsed", on);
  }

  /**
   * Build the ncWMS GetTransect URL for a drawn line (OWGIS 2 Transect.js).
   *
   * @param geom line in map projection
   * @returns absolute GetTransect URL
   */
  function buildTransectUrl(geom: LineString): string {
    const coords = geom.getCoordinates() as number[][];
    const linestring = coords.map(([x, y]) => `${x} ${y}`).join(",");
    const layerParam = mainLayer!.ncWms ? "LAYERS" : "LAYER";
    const time = currentTime || details.nearestTimeIso || "";
    const parts = [
      `${mainLayer!.server}?REQUEST=GetTransect`,
      `${layerParam}=${encodeURIComponent(mainLayer!.name)}`,
      `CRS=${encodeURIComponent(projection)}`,
      `LINESTRING=${encodeURIComponent(linestring)}`,
      "FORMAT=image/png",
      `COLORSCALERANGE=${minPal},${maxPal}`,
      "NUMCOLORBANDS=250",
      "LOGSCALE=false",
      `PALETTE=${encodeURIComponent(palette)}`,
    ];
    if (time) {
      parts.push(`TIME=${encodeURIComponent(time)}`);
    }
    if (currentElevation !== undefined && currentElevation !== "") {
      parts.push(`ELEVATION=${encodeURIComponent(String(currentElevation))}`);
    }
    return parts.join("&");
  }

  /**
   * Handle a finished transect line: request GetTransect and show the plot.
   *
   * @param geom finished line in map projection
   */
  function finishTransect(geom: LineString): void {
    if (!mainLayer) {
      return;
    }
    const url = buildTransectUrl(geom);
    const status = panels.querySelector("#transect-status");
    if (status) {
      status.innerHTML =
        `Transect ready. <a target="_blank" rel="noreferrer" href="${viaProxy(url, site.settings.proxyBase)}">Open in tab</a>`;
    }
    setStatus("Transect generated — draw again or click Transect to stop.");
    openPlotModal("Vertical transect", url);
  }

  /**
   * Turn transect drawing on or off (OWGIS 2 toggleControl / toggleTransect).
   *
   * @param on enable drawing when true
   */
  function setTransectActive(on: boolean): void {
    if (on === transectActive && (!!drawInteraction === on)) {
      syncTransectButtons(on);
      return;
    }

    if (drawInteraction) {
      map.removeInteraction(drawInteraction);
      drawInteraction = null;
    }

    transectActive = on;
    syncTransectButtons(on);

    if (!on) {
      drawSource.clear();
      setStatus("");
      const status = panels.querySelector("#transect-status");
      if (status) {
        status.textContent = "";
      }
      return;
    }

    closePopup();
    drawInteraction = new Draw({
      source: drawSource,
      type: "LineString",
      style: transectStyle,
    });
    drawInteraction.on("drawstart", () => {
      drawSource.clear();
      closePopup();
    });
    drawInteraction.on("drawend", (event) => {
      const geom = event.feature.getGeometry();
      if (geom && geom.getType() === "LineString") {
        finishTransect(geom as LineString);
      }
    });
    map.addInteraction(drawInteraction);
    setStatus("Transect: click the map to add points; double-click to finish.");
    const status = panels.querySelector("#transect-status");
    if (status) {
      status.textContent = "Click the map to add points; double-click to finish.";
    }
  }

  /**
   * Toggle transect draw mode.
   */
  function toggleTransect(): void {
    if (!mainLayer?.ncWms) {
      setStatus("Transect requires an ncWMS layer.");
      return;
    }
    setTransectActive(!transectActive);
  }

  /**
   * Render floating windows: layers, calendars, palettes, elevation, animation, tools.
   */
  function renderPanels(): void {
    const zvals = details.zaxis?.values ?? [];
    const lang = site.settings.defaultLanguage;
    const dates = flattenDates(details.datesWithData);

    panels.innerHTML = `
      <div id="mainMenuParent" class="transDraggableWindow" data-tab-label="Main layers">
        ${windowChrome("Main Layers")}
        <div class="win-body">
          ${cascadedMainMenusHtml(site, mainLayer!, lang)}
        </div>
      </div>

      <div id="optionalMenuParent" class="transDraggableWindow ${site.layers.some((l) => l.kind === "optional") ? "" : "hidden"}" data-tab-label="Optional layers">
        ${windowChrome("Optional Layers")}
        <div class="win-body">
          ${optionalLayersHtml(site, lang, optionalOpacity)}
        </div>
      </div>

      <div id="CalendarsAndStopContainer" class="transDraggableWindow ${dates.length ? "" : "hidden"}" data-tab-label="Calendars">
        ${windowChrome("Calendars")}
        <div class="win-body calendars-body">
          <div class="calendars-titles">
            <div class="title invShadow" id="cal-start-title">Start date (current)</div>
            <div class="title invShadow" id="cal-end-title">End date</div>
          </div>
          <div class="calendars-row">
            <div id="cal-start"></div>
            <div id="cal-end"></div>
          </div>
          <div class="calendars-hours">
            <div class="hour-wrap"><select id="startTimeCalendar" name="startTimeCalendar"></select></div>
            <div class="hour-wrap"><select id="endTimeCalendar" name="endTimeCalendar"></select></div>
          </div>
          <div class="calendars-res invShadow" id="animRes">
            <div>Resolution:</div>
            <label class="radio-inline"><input type="radio" value="high" name="video_res" /> High</label>
            <label class="radio-inline"><input type="radio" value="normal" name="video_res" checked /> Middle</label>
            <label class="radio-inline"><input type="radio" value="low" name="video_res" /> Low</label>
          </div>
          <div class="calendars-anim" id="animDisp">
            <button type="button" class="buttonStyle" id="btn-disp-anim">Display animation</button>
            <select id="timeSelect" name="timeSelect"></select>
          </div>
          <select id="date" class="hidden" aria-hidden="true"></select>
          <select id="hour" class="hidden" aria-hidden="true"></select>
        </div>
      </div>

      <div id="paletteWindowColorRange" class="transDraggableWindow hidden" data-tab-label="Palettes">
        ${windowChrome("Color range", { allowMinimize: false })}
        <div class="win-body">
          <div class="legend-row">
            <button type="button" class="legend-pick-btn" id="btn-open-palettes" title="Choose a new palette">
              <img id="legend-img" alt="Current palette — click to choose" src="${viaProxy(legendUrl(mainLayer!, palette), site.settings.proxyBase)}" />
            </button>
            <div class="color-range-controls">
              <div class="color-range-row">
                <span class="color-range-label">Max</span>
                <input id="max-pal" class="inputSizePalettes" type="text" inputmode="decimal" value="${maxPal}" />
                <button type="button" class="buttonStyle color-range-step" id="btn-max-plus" title="Increase max">+</button>
                <button type="button" class="buttonStyle color-range-step" id="btn-max-minus" title="Decrease max">−</button>
              </div>
              <div class="color-range-actions row">
                <button type="button" class="buttonStyle" id="btn-update-pal">Update</button>
                <button type="button" class="buttonStyle beenUsed" id="btn-auto-pal">Auto</button>
              </div>
              <div class="color-range-row">
                <span class="color-range-label">Min</span>
                <input id="min-pal" class="inputSizePalettes" type="text" inputmode="decimal" value="${minPal}" />
                <button type="button" class="buttonStyle color-range-step" id="btn-min-plus" title="Increase min">+</button>
                <button type="button" class="buttonStyle color-range-step" id="btn-min-minus" title="Decrease min">−</button>
              </div>
              <p class="muted">Click the color bar to choose a palette.</p>
            </div>
          </div>
        </div>
      </div>

      <div id="palettes-div" class="transDraggableWindow hidden" data-tab-label="Choose palette">
        ${windowChrome("Choose a new palette", { allowMinimize: false })}
        <div class="win-body palettes-picker-body">
          <table id="palettesTable" class="palettes-table" aria-label="Available palettes"></table>
          <div class="palettes-pager">
            <button type="button" class="buttonStyle" id="btn_prev" title="Previous palettes">◀</button>
            <button type="button" class="buttonStyle" id="defaultColorRangeButton">Default</button>
            <button type="button" class="buttonStyle" id="btn_next" title="More palettes">▶</button>
          </div>
        </div>
      </div>

      <div id="zaxis_selector_parent" class="draggableWindow hidden" data-tab-label="Elevation">
        ${windowChrome("Elevation / depth", { allowMinimize: false })}
        <div class="win-body">
          <label>Level
            <select id="elev-select">
              ${zvals.map((z) => `<option value="${z}" ${String(z) === String(currentElevation) ? "selected" : ""}>${z} ${details.zaxis?.units ?? ""}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>

      <div id="animControls" class="transDraggableWindow hidden" data-tab-label="Animation">
        ${windowChrome("Animation controls", { allowMinimize: false })}
        <div class="win-body anim-body">
          <label class="anim-range-label">Range
            <select id="anim-range"></select>
          </label>
          <div class="anim-transport" role="toolbar" aria-label="Animation transport">
            <button type="button" class="anim-icon-btn" id="anim-first" title="First frame" aria-label="First frame">⏮</button>
            <button type="button" class="anim-icon-btn" id="anim-prev" title="Previous frame" aria-label="Previous frame">⏪</button>
            <button type="button" class="anim-icon-btn" id="anim-slower" title="Slower" aria-label="Slower">◁</button>
            <button type="button" class="anim-icon-btn anim-stop-btn" id="anim-stop" title="Stop" aria-label="Stop">⏹</button>
            <button type="button" class="anim-icon-btn anim-play-btn" id="anim-play" title="Play" aria-label="Play">▶</button>
            <button type="button" class="anim-icon-btn hidden" id="anim-pause" title="Pause" aria-label="Pause">⏸</button>
            <button type="button" class="anim-icon-btn" id="anim-faster" title="Faster" aria-label="Faster">▷</button>
            <button type="button" class="anim-icon-btn" id="anim-next" title="Next frame" aria-label="Next frame">⏩</button>
            <button type="button" class="anim-icon-btn" id="anim-last" title="Last frame" aria-label="Last frame">⏭</button>
            <a class="anim-icon-btn" id="anim-download" href="#" target="_blank" rel="noreferrer" title="Download GIF" aria-label="Download GIF">💾</a>
          </div>
          <div class="anim-meta">
            <div><span class="anim-meta-label">Current date:</span> <span id="animDate">—</span></div>
            <div><span class="anim-meta-label">Speed:</span> <span id="animSpeed">1.0 fps</span></div>
          </div>
          <p class="muted" id="anim-label"></p>
        </div>
      </div>

      <div id="currentsControlsContainer" class="transDraggableWindow hidden" data-tab-label="Streamlines">
        ${windowChrome("Streamlines", { allowMinimize: false })}
        <div class="win-body">
          <p class="muted"><code>${mainLayer!.overlayStreamlines ?? ""}</code></p>
          <label>Particles <span id="numParticlesLabel"></span>
            <input id="numParticlesSlider" type="range" min="100" max="40000" step="100" />
          </label>
          <label>Speed
            <input id="particleSpeedSlider" type="range" min="1" max="100" step="1" />
          </label>
          <label>Lifetime
            <input id="particleLifeTimeSlider" type="range" min="10" max="300" step="1" />
          </label>
          <label>Color <input id="currentsColor" type="color" value="#ffffff" /></label>
          <label>Opacity <input id="stream-opacity" type="range" min="0.1" max="1" step="0.05" value="0.6" /></label>
          <div class="row">
            <button type="button" class="buttonStyle" id="currentsPlayPauseButton">Pause</button>
            <button type="button" class="buttonStyle" id="streamlines-reset">Reset</button>
          </div>
        </div>
      </div>

      <div id="toolsPanel" class="draggableWindow hidden" data-tab-label="Tools">
        ${windowChrome("Identify / Transect", { allowMinimize: false })}
        <div class="win-body">
          <p class="muted">Click the map for GetFeatureInfo.</p>
          <label class="hidden">CQL filter <input id="cql-input" value="${mainLayer!.cql ?? ""}" placeholder="optional CQL" /></label>
          <div class="row">
            <button type="button" class="buttonStyle hidden" id="btn-cql">Apply CQL</button>
            <button type="button" class="buttonStyle" id="btn-transect">Draw transect</button>
            <button type="button" class="buttonStyle" id="btn-clear-draw">Clear</button>
            <button type="button" class="buttonStyle" id="btn-export-png">Export PNG</button>
          </div>
          <p class="muted" id="transect-status"></p>
        </div>
      </div>
    `;

    /**
     * Switch the active main layer and rebuild dependent UI.
     *
     * @param id layer config id
     */
    async function selectMainLayerById(id: string): Promise<void> {
      const next = site.layers.find((l) => l.id === id);
      if (!next) {
        return;
      }
      const gen = ++layerSelectGen;
      site.layers.forEach((l) => {
        if (l.kind === "main") {
          l.selected = l.id === id;
        }
      });
      mainLayer = next;
      details = await loadLayerDetails(next, site.settings, site.bakedDetails?.[next.id]);
      if (gen !== layerSelectGen) {
        return;
      }
      minPal = Number(details.scaleRange?.[0] ?? 0);
      maxPal = Number(details.scaleRange?.[1] ?? 1);
      palette = next.palette || details.defaultPalette || "default";
      currentTime = details.nearestTimeIso ?? "";
      currentElevation = details.zaxis?.values?.[0];
      wmsSource.setUrl(next.server);
      renderToolbar();
      renderPanels();
      await loadHoursForCurrentDate();
      if (gen !== layerSelectGen) {
        return;
      }
      refreshWmsParams();
      fitLayer(next);
    }

    /**
     * Resolve the first main layer matching the current cascaded menu path.
     *
     * @returns layer id or undefined
     */
    function layerIdFromMenus(): string | undefined {
      const l0 = (panels.querySelector("#menu-l0") as HTMLSelectElement | null)?.value;
      const l1 = (panels.querySelector("#menu-l1") as HTMLSelectElement | null)?.value;
      const l2 = (panels.querySelector("#menu-l2") as HTMLSelectElement | null)?.value;
      const match = site.layers.find((l) => {
        if (l.kind !== "main") {
          return false;
        }
        if (l0 && l.menuPath[0] !== l0) {
          return false;
        }
        if (l1 && l.menuPath[1] !== l1) {
          return false;
        }
        if (l2 && l.menuPath[2] !== l2) {
          return false;
        }
        return true;
      });
      return match?.id;
    }

    const onMenuCascade = async (): Promise<void> => {
      // Rebuild selects for the new path, then select the matching leaf layer.
      const id = layerIdFromMenus();
      if (id) {
        await selectMainLayerById(id);
      }
    };

    panels.querySelector("#menu-l0")?.addEventListener("change", () => {
      void onMenuCascade();
    });
    panels.querySelector("#menu-l1")?.addEventListener("change", () => {
      void onMenuCascade();
    });
    panels.querySelector("#menu-l2")?.addEventListener("change", () => {
      void onMenuCascade();
    });

    panels.querySelector("#main-layer")?.addEventListener("change", async (event) => {
      await selectMainLayerById((event.target as HTMLSelectElement).value);
    });

    /**
     * Sync optional overlay visibility / opacity UI to OpenLayers layers.
     *
     * @param layerId optional layer config id
     * @param visible whether the overlay is shown
     */
    function setOptionalVisible(layerId: string, visible: boolean): void {
      const cfg = site.layers.find((l) => l.id === layerId);
      if (cfg) {
        cfg.selected = visible;
      }
      optionalOlLayers.get(layerId)?.setVisible(visible);
    }

    /**
     * Adjust optional overlay opacity by a delta (OWGIS 2 ± buttons).
     *
     * @param layerId optional layer config id
     * @param delta opacity change (−0.1 / +0.1)
     */
    function nudgeOptionalOpacity(layerId: string, delta: number): void {
      const current = optionalOpacity.get(layerId) ?? 1;
      const next = Math.min(1, Math.max(0, Math.round((current + delta) * 10) / 10));
      optionalOpacity.set(layerId, next);
      optionalOlLayers.get(layerId)?.setOpacity(next);
      const label = panels.querySelector<HTMLElement>(`.opt-lay-op-val[data-layer-id="${layerId}"]`);
      if (label) {
        label.textContent = `${Math.round(next * 100)}%`;
      }
    }

    panels.querySelectorAll<HTMLInputElement>(".opt-lay-check").forEach((input) => {
      input.addEventListener("change", () => {
        setOptionalVisible(input.dataset.layerId ?? "", input.checked);
      });
    });
    panels.querySelectorAll<HTMLButtonElement>(".opt-lay-minus").forEach((btn) => {
      btn.addEventListener("click", () => {
        nudgeOptionalOpacity(btn.dataset.layerId ?? "", -0.1);
      });
    });
    panels.querySelectorAll<HTMLButtonElement>(".opt-lay-plus").forEach((btn) => {
      btn.addEventListener("click", () => {
        nudgeOptionalOpacity(btn.dataset.layerId ?? "", 0.1);
      });
    });
    panels.querySelectorAll<HTMLElement>(".opt-lay-title[data-toggle-ul]").forEach((title) => {
      const toggle = (): void => {
        const sel = title.dataset.toggleUl;
        if (!sel) {
          return;
        }
        const list = panels.querySelector<HTMLElement>(sel);
        if (!list) {
          return;
        }
        list.classList.toggle("collapsed");
        title.classList.toggle("collapsed", list.classList.contains("collapsed"));
      };
      title.addEventListener("click", toggle);
      title.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });

    initDualCalendars();

    panels.querySelector("#startTimeCalendar")?.addEventListener("change", () => {
      currentTime = timeFromStartControls();
      refreshWmsParams();
      void refreshAnimOptions();
    });

    panels.querySelector("#endTimeCalendar")?.addEventListener("change", () => {
      void refreshAnimOptions();
    });

    panels.querySelector("#btn-disp-anim")?.addEventListener("click", () => {
      const timeSelect = panels.querySelector("#timeSelect") as HTMLSelectElement & {
        __options?: AnimOption[];
      };
      const animSelect = panels.querySelector("#anim-range") as HTMLSelectElement | null;
      if (animSelect && timeSelect) {
        animSelect.value = timeSelect.value;
      }
      // Show transport controls only after Display animation (no top-bar Anim button).
      const animPanel = panels.querySelector("#animControls") as HTMLElement | null;
      if (mobile) {
        mobileChrome?.openPanelSheet("animControls");
      } else if (animPanel) {
        animPanel.classList.remove("hidden", "minimized");
        if (!animPanel.style.left) {
          animPanel.style.left = "24px";
          animPanel.style.top = "120px";
        }
      }
      (panels.querySelector("#anim-play") as HTMLButtonElement | null)?.click();
    });

    panels.querySelector("#timeSelect")?.addEventListener("change", (event) => {
      const animSelect = panels.querySelector("#anim-range") as HTMLSelectElement | null;
      if (animSelect) {
        animSelect.value = (event.target as HTMLSelectElement).value;
      }
    });

    panels.querySelector("#btn-update-pal")?.addEventListener("click", () => {
      minPal = Number((panels.querySelector("#min-pal") as HTMLInputElement).value);
      maxPal = Number((panels.querySelector("#max-pal") as HTMLInputElement).value);
      refreshWmsParams();
    });

    /**
     * OWGIS 2 unit step for color-range ± buttons.
     * Uses 0.1 when the default scale is within (0, 1), otherwise 1.
     *
     * @returns step size
     */
    function colorRangeStep(): number {
      const lo = Number(details.scaleRange?.[0] ?? minPal);
      const hi = Number(details.scaleRange?.[1] ?? maxPal);
      const fractional =
        (lo > 0 && lo < 1) || (hi > 0 && hi < 1);
      return fractional ? 0.1 : 1;
    }

    /**
     * Read Max/Min inputs, apply a delta to one field, and refresh the map.
     *
     * @param which which bound to adjust
     * @param direction +1 or −1 (OWGIS 2 increaseMax / decreaseMin sign convention)
     */
    function nudgeColorRange(which: "max" | "min", direction: number): void {
      const maxInput = panels.querySelector("#max-pal") as HTMLInputElement | null;
      const minInput = panels.querySelector("#min-pal") as HTMLInputElement | null;
      if (!maxInput || !minInput) {
        return;
      }
      const step = colorRangeStep() * direction;
      if (which === "max") {
        maxPal = Number((Number(maxInput.value) + step).toPrecision(4));
        maxInput.value = String(maxPal);
      } else {
        // OWGIS 2 decreaseMinColorRange subtracts the amount argument.
        minPal = Number((Number(minInput.value) - step).toPrecision(4));
        minInput.value = String(minPal);
      }
      minPal = Number(minInput.value);
      maxPal = Number(maxInput.value);
      refreshWmsParams();
    }

    panels.querySelector("#btn-max-plus")?.addEventListener("click", () => {
      nudgeColorRange("max", 1);
    });
    panels.querySelector("#btn-max-minus")?.addEventListener("click", () => {
      nudgeColorRange("max", -1);
    });
    panels.querySelector("#btn-min-plus")?.addEventListener("click", () => {
      nudgeColorRange("min", -1);
    });
    panels.querySelector("#btn-min-minus")?.addEventListener("click", () => {
      nudgeColorRange("min", 1);
    });

    for (const id of ["#max-pal", "#min-pal"] as const) {
      panels.querySelector(id)?.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Enter") {
          minPal = Number((panels.querySelector("#min-pal") as HTMLInputElement).value);
          maxPal = Number((panels.querySelector("#max-pal") as HTMLInputElement).value);
          refreshWmsParams();
        }
      });
    }

    panels.querySelector("#btn-auto-pal")?.addEventListener("click", async () => {
      try {
        const extent3857 = map.getView().calculateExtent(map.getSize());
        const extent4326 = transformExtent(extent3857, projection, "EPSG:4326");
        const bbox = `${extent4326[0]},${extent4326[1]},${extent4326[2]},${extent4326[3]}`;
        const url = minMaxUrl(mainLayer!, {
          bbox,
          srs: "EPSG:4326",
          time: currentTime,
          elevation: currentElevation,
          styles: mainLayer!.style,
        });
        const json = await fetchWmsJson<{ min: number; max: number }>(url, site.settings.proxyBase);
        minPal = json.min;
        maxPal = json.max;
        (panels.querySelector("#min-pal") as HTMLInputElement).value = String(minPal);
        (panels.querySelector("#max-pal") as HTMLInputElement).value = String(maxPal);
        refreshWmsParams();
        setStatus(`Auto range ${minPal.toPrecision(4)} … ${maxPal.toPrecision(4)}`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    });

    const PALETTES_PER_PAGE = 10;
    let palettePage = 1;

    /**
     * Apply a palette name and refresh the map / legend / picker selection.
     *
     * @param name ncWMS palette id
     */
    const applyPalette = (name: string): void => {
      palette = name;
      refreshWmsParams();
      fillPalettePage(palettePage);
      setStatus(`Palette ${name}`);
    };

    /**
     * Render one page of vertical palette swatches (OWGIS 2 palettesTable).
     *
     * @param page 1-based page index
     */
    const fillPalettePage = (page: number): void => {
      const table = panels.querySelector("#palettesTable") as HTMLTableElement | null;
      const prevBtn = panels.querySelector("#btn_prev") as HTMLButtonElement | null;
      const nextBtn = panels.querySelector("#btn_next") as HTMLButtonElement | null;
      if (!table || !mainLayer) {
        return;
      }
      const list = details.palettes?.length ? details.palettes : [palette];
      const pages = Math.max(1, Math.ceil(list.length / PALETTES_PER_PAGE));
      palettePage = Math.min(Math.max(1, page), pages);
      const start = (palettePage - 1) * PALETTES_PER_PAGE;
      const slice = list.slice(start, start + PALETTES_PER_PAGE);
      table.innerHTML = `<tr>${slice
        .map((pal) => {
          const src = viaProxy(legendUrl(mainLayer!, pal), site.settings.proxyBase);
          const selected = pal === palette ? "selected" : "";
          return `<td>
            <button type="button" class="opt-palette-btn ${selected}" data-palette="${pal}" title="${pal}">
              <img class="optPaletteImg" src="${src}" alt="${pal}" width="20" height="120" />
            </button>
          </td>`;
        })
        .join("")}</tr>`;
      table.querySelectorAll<HTMLButtonElement>(".opt-palette-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const name = btn.dataset.palette;
          if (name) {
            applyPalette(name);
          }
        });
      });
      if (prevBtn) {
        prevBtn.style.visibility = palettePage <= 1 ? "hidden" : "visible";
      }
      if (nextBtn) {
        nextBtn.style.visibility = palettePage >= pages ? "hidden" : "visible";
      }
    };

    /**
     * Show or hide the visual palette picker window.
     *
     * @param force when set, show (true) or hide (false); otherwise toggle
     */
    const togglePalettePicker = (force?: boolean): void => {
      const picker = panels.querySelector("#palettes-div") as HTMLElement | null;
      if (!picker) {
        return;
      }
      const show =
        force !== undefined
          ? force
          : picker.classList.contains("hidden") || picker.classList.contains("minimized");
      if (mobile && show) {
        mobileChrome?.openPanelSheet("palettes-div");
        fillPalettePage(palettePage);
        return;
      }
      picker.classList.toggle("hidden", !show);
      picker.classList.toggle("minimized", !show);
      if (show) {
        fillPalettePage(palettePage);
        if (!picker.style.left) {
          picker.style.left = "42%";
          picker.style.top = "180px";
        }
      }
    };

    panels.querySelector("#btn-open-palettes")?.addEventListener("click", () => {
      togglePalettePicker();
    });
    panels.querySelector("#btn_prev")?.addEventListener("click", () => {
      fillPalettePage(palettePage - 1);
    });
    panels.querySelector("#btn_next")?.addEventListener("click", () => {
      fillPalettePage(palettePage + 1);
    });
    panels.querySelector("#defaultColorRangeButton")?.addEventListener("click", () => {
      applyPalette(details.defaultPalette || "default");
    });
    fillPalettePage(1);

    panels.querySelector("#elev-select")?.addEventListener("change", (event) => {
      currentElevation = (event.target as HTMLSelectElement).value;
      refreshWmsParams();
    });

    panels.querySelector("#btn-cql")?.addEventListener("click", () => {
      const cql = (panels.querySelector("#cql-input") as HTMLInputElement).value.trim();
      const params = { ...wmsSource.getParams() };
      if (cql) {
        params.CQL_FILTER = cql;
      } else {
        delete params.CQL_FILTER;
      }
      wmsSource.updateParams(params);
    });

    panels.querySelector("#btn-transect")?.addEventListener("click", () => {
      toggleTransect();
    });

    panels.querySelector("#btn-clear-draw")?.addEventListener("click", () => {
      drawSource.clear();
      setTransectActive(false);
      const status = panels.querySelector("#transect-status");
      if (status) {
        status.textContent = "";
      }
    });

    panels.querySelector("#btn-export-png")?.addEventListener("click", () => {
      map.once("rendercomplete", () => {
        const mapCanvas = document.createElement("canvas");
        const size = map.getSize();
        if (!size) {
          return;
        }
        mapCanvas.width = size[0];
        mapCanvas.height = size[1];
        const mapContext = mapCanvas.getContext("2d");
        if (!mapContext) {
          return;
        }
        document.querySelectorAll(".ol-layer canvas").forEach((canvas) => {
          const c = canvas as HTMLCanvasElement;
          if (c.width > 0) {
            const opacity = (c.parentElement as HTMLElement)?.style.opacity || "1";
            mapContext.globalAlpha = Number(opacity);
            mapContext.drawImage(c, 0, 0);
          }
        });
        mapCanvas.toBlob((blob) => {
          if (!blob) {
            return;
          }
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "owgis3-map.png";
          a.click();
        });
      });
      map.renderSync();
    });

    // Clear previous minimize tabs when re-rendering panels.
    const dock = root.querySelector("#minimizedWindowsContainer");
    if (dock) {
      dock.innerHTML = "";
    }
    initFloatingWindows(root, { mobile });
    syncTransectButtons(transectActive);
    wireAnimationControls();
    wireStreamlines();
  }

  /**
   * Load animation range options from ncWMS into Calendars #timeSelect and Animation #anim-range.
   */
  async function refreshAnimOptions(): Promise<void> {
    const select = panels.querySelector("#anim-range") as HTMLSelectElement | null;
    const timeSelect = panels.querySelector("#timeSelect") as HTMLSelectElement | null;
    if ((!select && !timeSelect) || !mainLayer?.ncWms) {
      return;
    }
    const bounds = animationBounds();
    if (!bounds) {
      return;
    }
    try {
      const json = await fetchWmsJson<{ timeStrings: Array<{ title: string; timeString: string }> }>(
        animationTimestepsUrl(mainLayer, bounds.start, bounds.end),
        site.settings.proxyBase,
      );
      const options: AnimOption[] = (json.timeStrings ?? []).map((item) => {
        const match = item.title.match(/(\d+)/);
        return {
          title: item.title,
          timeString: item.timeString,
          frames: match ? Number(match[1]) : 1,
        };
      });
      const html = options
        .map((o, i) => `<option value="${i}" data-ts="${o.timeString}">${o.title}</option>`)
        .join("");
      if (select) {
        select.innerHTML = html;
        (select as HTMLSelectElement & { __options?: AnimOption[] }).__options = options;
      }
      if (timeSelect) {
        timeSelect.innerHTML = html;
        (timeSelect as HTMLSelectElement & { __options?: AnimOption[] }).__options = options;
      }
    } catch (error) {
      if (select) {
        select.innerHTML = "";
      }
      if (timeSelect) {
        timeSelect.innerHTML = "";
      }
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Bind animation transport buttons (OWGIS 2 AnimationControls).
   */
  function wireAnimationControls(): void {
    const label = panels.querySelector("#anim-label") as HTMLElement | null;
    const dateEl = panels.querySelector("#animDate") as HTMLElement | null;
    const speedEl = panels.querySelector("#animSpeed") as HTMLElement | null;
    const playBtn = panels.querySelector("#anim-play") as HTMLButtonElement | null;
    const pauseBtn = panels.querySelector("#anim-pause") as HTMLButtonElement | null;
    const downloadLink = panels.querySelector("#anim-download") as HTMLAnchorElement | null;

    /**
     * Refresh the fps readout from `animSpeedMs`.
     */
    function updateSpeedLabel(): void {
      if (speedEl) {
        speedEl.textContent = `${(1000 / animSpeedMs).toFixed(1)} fps`;
      }
    }

    /**
     * Toggle play / pause button visibility.
     *
     * @param playing whether playback is active
     */
    function setPlayingUi(playing: boolean): void {
      playBtn?.classList.toggle("hidden", playing);
      pauseBtn?.classList.toggle("hidden", !playing);
    }

    /**
     * Build an ncWMS animated GIF GetMap URL for the current frames (OWGIS 2 save).
     *
     * @returns absolute GIF URL or null
     */
    function buildAnimGifUrl(): string | null {
      if (!mainLayer || !animFrames.length) {
        return null;
      }
      const size = map.getSize();
      if (!size) {
        return null;
      }
      const extent = map.getView().calculateExtent(size);
      const params = new URLSearchParams({
        REQUEST: "GetMap",
        VERSION: "1.3.0",
        LAYERS: mainLayer.name,
        STYLES: `${mainLayer.style}/${palette}`,
        FORMAT: "image/gif",
        TRANSPARENT: "true",
        WIDTH: String(Math.min(size[0], 1024)),
        HEIGHT: String(Math.min(size[1], 768)),
        CRS: projection,
        BBOX: extent.join(","),
        COLORSCALERANGE: `${minPal},${maxPal}`,
        NUMCOLORBANDS: "250",
        TIME: animFrames.join(","),
        ANIMATION: "TRUE",
      });
      if (currentElevation !== undefined && currentElevation !== "") {
        params.set("ELEVATION", String(currentElevation));
      }
      return `${mainLayer.server}?${params.toString()}`;
    }

    /**
     * Sync the download link href to the current GIF URL.
     */
    function refreshDownloadLink(): void {
      if (!downloadLink) {
        return;
      }
      const absolute = buildAnimGifUrl();
      if (!absolute) {
        downloadLink.removeAttribute("href");
        downloadLink.classList.add("is-disabled");
        return;
      }
      downloadLink.href = viaProxy(absolute, site.settings.proxyBase);
      downloadLink.classList.remove("is-disabled");
    }

    /**
     * Show the current animation frame on the map.
     */
    function showFrame(): void {
      if (!animFrames.length) {
        return;
      }
      currentTime = animFrames[animIndex];
      refreshWmsParams();
      const short = currentTime
        .replace(":00:00.000Z", "")
        .replace("T", " ");
      if (dateEl) {
        dateEl.textContent = short;
      }
      if (label) {
        label.textContent = `${animIndex + 1}/${animFrames.length}: ${currentTime}`;
      }
      refreshDownloadLink();
    }

    /**
     * Ensure frames are loaded from the selected range.
     *
     * @returns true when frames are available
     */
    function ensureFrames(): boolean {
      if (animFrames.length) {
        return true;
      }
      const timeSelect = panels.querySelector("#timeSelect") as HTMLSelectElement & {
        __options?: AnimOption[];
      };
      const select = (panels.querySelector("#anim-range") as HTMLSelectElement & {
        __options?: AnimOption[];
      }) ?? timeSelect;
      const source = timeSelect?.__options?.length ? timeSelect : select;
      const opt = source?.__options?.[Number(source.value)];
      if (!opt) {
        setStatus("No animation range available");
        return false;
      }
      animFrames = expandFrames(opt.timeString, hours);
      animIndex = 0;
      return animFrames.length > 0;
    }

    /**
     * Start or restart the playback interval.
     */
    function startLoop(): void {
      window.clearInterval(animTimer);
      animTimer = window.setInterval(() => {
        if (!animPlaying || !animFrames.length) {
          return;
        }
        animIndex = (animIndex + 1) % animFrames.length;
        showFrame();
      }, animSpeedMs);
      updateSpeedLabel();
    }

    /**
     * Begin playback from the selected range.
     */
    function playAnimation(): void {
      if (!ensureFrames()) {
        return;
      }
      animPlaying = true;
      setPlayingUi(true);
      showFrame();
      startLoop();
    }

    /**
     * Pause playback (keep panel and current frame).
     */
    function pauseAnimation(): void {
      animPlaying = false;
      window.clearInterval(animTimer);
      setPlayingUi(false);
    }

    /**
     * Stop playback and close animation controls (OWGIS 2 status none).
     */
    function stopAnimation(): void {
      pauseAnimation();
      const animPanel = panels.querySelector("#animControls") as HTMLElement | null;
      animPanel?.classList.add("hidden", "minimized");
      document.body.classList.remove("mob-panel-open");
      document.querySelector("#mob-backdrop")?.classList.add("hidden");
      setStatus("");
    }

    panels.querySelector("#anim-play")?.addEventListener("click", () => {
      playAnimation();
    });
    panels.querySelector("#anim-pause")?.addEventListener("click", () => {
      pauseAnimation();
    });
    panels.querySelector("#anim-stop")?.addEventListener("click", () => {
      stopAnimation();
    });
    panels.querySelector("#anim-next")?.addEventListener("click", () => {
      if (!ensureFrames()) {
        return;
      }
      animIndex = (animIndex + 1) % animFrames.length;
      showFrame();
    });
    panels.querySelector("#anim-prev")?.addEventListener("click", () => {
      if (!ensureFrames()) {
        return;
      }
      animIndex = (animIndex - 1 + animFrames.length) % animFrames.length;
      showFrame();
    });
    panels.querySelector("#anim-first")?.addEventListener("click", () => {
      if (!ensureFrames()) {
        return;
      }
      animIndex = 0;
      showFrame();
    });
    panels.querySelector("#anim-last")?.addEventListener("click", () => {
      if (!ensureFrames()) {
        return;
      }
      animIndex = animFrames.length - 1;
      showFrame();
    });
    panels.querySelector("#anim-faster")?.addEventListener("click", () => {
      animSpeedMs = Math.max(80, animSpeedMs * 0.8);
      updateSpeedLabel();
      if (animPlaying) {
        startLoop();
      }
    });
    panels.querySelector("#anim-slower")?.addEventListener("click", () => {
      animSpeedMs = Math.min(5000, animSpeedMs * 1.2);
      updateSpeedLabel();
      if (animPlaying) {
        startLoop();
      }
    });
    panels.querySelector("#anim-range")?.addEventListener("change", () => {
      animFrames = [];
      if (animPlaying) {
        playAnimation();
      } else {
        ensureFrames();
        showFrame();
      }
    });

    updateSpeedLabel();
    setPlayingUi(false);
    void refreshAnimOptions();
  }

  streamlines = new StreamlinesController(map, currentsCanvas, (text) => setStatus(text));

  /**
   * Start or stop particle streamlines for the current main layer.
   */
  function wireStreamlines(): void {
    if (!streamlines) {
      return;
    }
    if (!mainLayer?.overlayStreamlines) {
      streamlines.stop();
      dataLayer.setOpacity(0.85);
      return;
    }
    streamlines.start(mainLayer, {
      time: currentTime || undefined,
      elevation: currentElevation,
      proxyBase: site.settings.proxyBase,
    });
    // Slightly fade the scalar layer so particles read clearly (OWGIS 2 does this).
    dataLayer.setOpacity(0.55);

    const engine = streamlines.getEngine();
    const numSlider = panels.querySelector("#numParticlesSlider") as HTMLInputElement | null;
    const speedSlider = panels.querySelector("#particleSpeedSlider") as HTMLInputElement | null;
    const lifeSlider = panels.querySelector("#particleLifeTimeSlider") as HTMLInputElement | null;
    const numLabel = panels.querySelector("#numParticlesLabel");
    const colorInput = panels.querySelector("#currentsColor") as HTMLInputElement | null;
    const opacityInput = panels.querySelector("#stream-opacity") as HTMLInputElement | null;
    const playBtn = panels.querySelector("#currentsPlayPauseButton") as HTMLButtonElement | null;

    if (numSlider) {
      numSlider.value = String(engine.getNumParticles());
      if (numLabel) {
        numLabel.textContent = String(engine.getNumParticles());
      }
      numSlider.oninput = () => {
        const n = Number(numSlider.value);
        engine.setNumParticles(n);
        if (numLabel) {
          numLabel.textContent = String(n);
        }
      };
    }
    if (speedSlider) {
      const base = engine.getCurrentResolutionParticleSpeed() || engine.getDefaultParticleSpeed();
      speedSlider.value = "30";
      speedSlider.oninput = () => {
        const factor = Number(speedSlider.value) / 30;
        engine.setParticleSpeed(base * factor);
      };
    }
    if (lifeSlider) {
      lifeSlider.value = String(engine.getParticlesLifeTime());
      lifeSlider.oninput = () => {
        engine.setParticlesLifeTime(Number(lifeSlider.value));
      };
    }
    if (colorInput) {
      const applyParticleColor = (): void => {
        const alpha = opacityInput ? Number(opacityInput.value) : 0.6;
        streamlines?.setColor(hexToRgba(colorInput.value, Number.isFinite(alpha) ? alpha : 0.6));
      };
      // Native color pickers fire input while dragging and change on commit.
      colorInput.oninput = applyParticleColor;
      colorInput.onchange = applyParticleColor;
      // Keep picker in sync with the active stroke color (default white).
      if (!colorInput.value) {
        colorInput.value = "#ffffff";
      }
      applyParticleColor();
    }
    if (opacityInput) {
      opacityInput.oninput = () => {
        const alpha = Number(opacityInput.value);
        streamlines?.setOpacity(Number.isFinite(alpha) ? alpha : 1);
        if (colorInput) {
          streamlines?.setColor(hexToRgba(colorInput.value, Number.isFinite(alpha) ? alpha : 0.6));
        }
      };
    }
    if (playBtn) {
      playBtn.onclick = () => {
        streamlines?.playPause();
        playBtn.textContent = streamlines?.isPaused() ? "Play" : "Pause";
      };
    }
    const resetBtn = panels.querySelector("#streamlines-reset") as HTMLButtonElement | null;
    if (resetBtn) {
      resetBtn.onclick = () => {
        engine.setNumParticles(engine.getDefaultNumParticles());
        engine.setParticlesLifeTime(engine.getDefaultParticlesLifeTime());
        engine.setParticleSpeed(engine.getCurrentResolutionParticleSpeed());
        streamlines?.setColor(hexToRgba("#ffffff", 0.6));
        if (colorInput) {
          colorInput.value = "#ffffff";
        }
        if (opacityInput) {
          opacityInput.value = "0.6";
        }
        if (numSlider) {
          numSlider.value = String(engine.getNumParticles());
        }
        if (numLabel) {
          numLabel.textContent = String(engine.getNumParticles());
        }
        if (lifeSlider) {
          lifeSlider.value = String(engine.getParticlesLifeTime());
        }
        if (speedSlider) {
          speedSlider.value = "30";
        }
      };
    }
  }

  map.on("singleclick", async (event) => {
    // OWGIS 2 disables identify while the transect draw tool is active.
    if (transectActive || drawInteraction) {
      return;
    }
    const size = map.getSize();
    if (!size || !mainLayer) {
      return;
    }
    const coordinate = event.coordinate;
    const lonLat = toLonLat(coordinate, projection);
    const extent3857 = map.getView().calculateExtent(size);
    // WMS 1.1.1 / ncWMS punctual helpers use lon,lat / projected BBOX with X/Y.
    const bbox3857 = extent3857.join(",");
    const extent4326 = transformExtent(extent3857, projection, "EPSG:4326");
    const bbox4326 = `${extent4326[1]},${extent4326[0]},${extent4326[3]},${extent4326[2]}`;
    const pixel = map.getEventPixel(event.originalEvent);
    const x = Math.floor(pixel[0]);
    const y = Math.floor(pixel[1]);

    closePopup();
    popupContent.innerHTML = `<b>Lon: </b>${lonLat[0].toFixed(2)} <b>Lat: </b>${lonLat[1].toFixed(2)}<br><span class="muted">Loading…</span>`;
    popup.style.display = "block";
    olPopup.setPosition(coordinate);

    const url = getFeatureInfoUrl(mainLayer, {
      bbox: bbox4326,
      width: size[0],
      height: size[1],
      x,
      y,
      srs: "EPSG:4326",
      time: currentTime,
      elevation: currentElevation,
      infoFormat: "text/xml",
    });

    try {
      const text = await (await fetch(viaProxy(url, site.settings.proxyBase))).text();
      const valueMatch = text.match(/<value[^>]*>([^<]+)<\/value>/i)
        ?? text.match(/>([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)</);
      const raw = valueMatch?.[1]?.trim();
      const units = details.units ? ` ${details.units}` : "";
      let valueHtml = "";
      if (raw && !/none/i.test(raw)) {
        const num = Number(raw);
        const formatted = Number.isFinite(num) ? num.toFixed(2) : raw;
        const label = /temp/i.test(mainLayer.name) ? "Temp" : "Value";
        valueHtml = `<b>${label}: </b>${formatted}${units}<br>`;
      }

      const bounds = animationBounds();
      const timeRange = bounds ? `${bounds.start}/${bounds.end}` : currentTime;
      const hasZ = (details.zaxis?.values?.length ?? 0) > 1;
      const hasTime = Boolean(mainLayer.ncWms && timeRange);

      let actionsHtml = "";
      if (hasTime) {
        actionsHtml += `<b>Time series plot: </b><button type="button" class="popup-show-btn" id="popup-show-ts">Show</button><br>`;
      }
      if (hasZ) {
        actionsHtml += `<b>Vertical profile: </b><button type="button" class="popup-show-btn" id="popup-show-vp">Show</button><br>`;
      }

      popupContent.innerHTML =
        `<b>Lon: </b>${lonLat[0].toFixed(2)} <b>Lat: </b>${lonLat[1].toFixed(2)}<br>`
        + valueHtml
        + actionsHtml;

      popupContent.querySelector("#popup-show-ts")?.addEventListener("click", () => {
        if (!timeRange) {
          return;
        }
        void openDynamicChartModal(
          "timeseries",
          `Time series — Lon ${lonLat[0].toFixed(2)} Lat ${lonLat[1].toFixed(2)}`,
          getTimeseriesUrl(mainLayer!, {
            bbox: bbox3857,
            width: size[0],
            height: size[1],
            x,
            y,
            srs: projection,
            timeRange,
            elevation: currentElevation,
            infoFormat: "text/csv",
          }),
        );
      });
      popupContent.querySelector("#popup-show-vp")?.addEventListener("click", () => {
        void openDynamicChartModal(
          "profile",
          `Vertical profile — Lon ${lonLat[0].toFixed(2)} Lat ${lonLat[1].toFixed(2)}`,
          getVerticalProfileUrl(mainLayer!, {
            bbox: bbox3857,
            width: size[0],
            height: size[1],
            x,
            y,
            srs: projection,
            time: currentTime,
            infoFormat: "text/csv",
          }),
        );
      });
    } catch (error) {
      popupContent.innerHTML =
        `<b>Lon: </b>${lonLat[0].toFixed(2)} <b>Lat: </b>${lonLat[1].toFixed(2)}<br>`
        + `<span class="muted">${error instanceof Error ? error.message : String(error)}</span>`;
    }
  });

  renderToolbar();
  renderPanels();
  await loadHoursForCurrentDate();
  if (hours[0] && currentTime && !currentTime.includes("T")) {
    currentTime = `${currentTime}T${hours[0]}`;
  }
  if (!currentTime && hours[0]) {
    const day = flattenDates(details.datesWithData)[0];
    currentTime = `${day}T${hours[0]}`;
  }
  window.addEventListener("resize", () => {
    updateHorizontalPalette();
  });
  refreshWmsParams();
  syncMapSize();
  fitLayer(mainLayer);
  syncMapSize();
}

const app = document.querySelector<HTMLElement>("#app");
if (app) {
  startViewer(app).catch((error: unknown) => {
    app.innerHTML = `<div class="panel" style="margin:1rem"><h2>Viewer error</h2>
      <p class="status error">${error instanceof Error ? error.message : String(error)}</p>
      <p><a href="./index.html">Back to Builder</a></p></div>`;
  });
}
