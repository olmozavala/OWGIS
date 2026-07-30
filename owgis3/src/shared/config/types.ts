/**
 * Shared TypeScript types for OWGIS3 site and layer configuration.
 * Mirrors the OWGIS 2 XML + MapViewConfig.properties model.
 */

/** Locale label map keyed by language code (EN, ES, …). */
export type LocaleLabels = Record<string, string>;

/** A menu entry from `<Menus><Menu ID="…" EN="…" />`. */
export interface MenuEntry {
  id: string;
  labels: LocaleLabels;
}

/** Geographic bounding box [west, south, east, north]. */
export type BBox = [number, number, number, number];

/** One map layer (main or optional). */
export interface LayerConfig {
  id: string;
  name: string;
  server: string;
  /** Optional server-side address (Docker host rewrite); unused in pure browser. */
  localAddress?: string;
  kind: "main" | "optional" | "background";
  menuPath: string[];
  labels: LocaleLabels;
  format: string;
  bbox: BBox;
  projection: string;
  style: string;
  palette: string;
  ncWms: boolean;
  ncWmsTwo: boolean;
  selected: boolean;
  featureInfo?: string;
  cql?: string;
  cqlCols?: string;
  overlayStreamlines?: string;
  defParticleSpeed?: number;
  maxTimeRange?: string;
  zoom?: number;
  center?: [number, number];
  minColor?: number;
  maxColor?: number;
  tiled?: boolean;
}

/** Site-wide map / UI settings (from MapViewConfig.properties). */
export interface SiteSettings {
  mapCenter: { lat: number; lon: number };
  zoom: number;
  zoomLevels: number;
  zoomFactor: number;
  maxResolution: number;
  backgroundLayer: string;
  availableBackgroundLayers: string[];
  availableBackgroundNames: string[];
  bingMapsKey?: string;
  defaultLanguage: string;
  availableLanguages: string[];
  restrictedExtent: [number, number, number, number];
  /** Base URL for CORS proxy, e.g. `/proxy` or `http://localhost:8091/proxy`. */
  proxyBase: string;
}

/** Full site configuration shipped as `config/site.json`. */
export interface SiteConfig {
  version: number;
  settings: SiteSettings;
  menus: MenuEntry[];
  layers: LayerConfig[];
  /** Optional pre-baked ncWMS layerDetails keyed by layer id. */
  bakedDetails?: Record<string, unknown>;
}

/** Runtime feature flags derived from the selected main layer. */
export interface FeatureFlags {
  ncwms: boolean;
  multipleDates: boolean;
  zaxis: boolean;
  streamlines: boolean;
  cql: boolean;
}

export function defaultSiteSettings(): SiteSettings {
  return {
    mapCenter: { lat: 24, lon: -90 },
    zoom: 2,
    zoomLevels: 18,
    zoomFactor: 2,
    maxResolution: 20000,
    backgroundLayer: "osm",
    availableBackgroundLayers: ["osm", "google", "googler"],
    availableBackgroundNames: ["Open Street Map", "Google Earth", "Google Roads"],
    defaultLanguage: "EN",
    availableLanguages: ["EN", "ES"],
    restrictedExtent: [-360, -90, 360, 90],
    proxyBase: "/proxy",
  };
}

export function emptySiteConfig(): SiteConfig {
  return {
    version: 3,
    settings: defaultSiteSettings(),
    menus: [],
    layers: [],
  };
}
