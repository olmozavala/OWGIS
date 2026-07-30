import type { LayerConfig, SiteSettings } from "../config/types";

/**
 * Build a proxied fetch URL when a proxy base is configured.
 *
 * @param absoluteUrl remote URL to fetch
 * @param proxyBase proxy endpoint (e.g. `/proxy`) or empty for direct fetch
 * @returns URL the browser should request
 */
export function viaProxy(absoluteUrl: string, proxyBase: string): string {
  if (!proxyBase) {
    return absoluteUrl;
  }
  const base = proxyBase.endsWith("/") ? proxyBase.slice(0, -1) : proxyBase;
  return `${base}?url=${encodeURIComponent(absoluteUrl)}`;
}

/**
 * Build query string from a parameter map.
 *
 * @param params key/value params
 * @returns encoded query string without leading ?
 */
export function paramsToQuery(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

/**
 * Fetch JSON or text from a WMS/ncWMS endpoint, optionally through the CORS proxy.
 *
 * @param url absolute remote URL
 * @param proxyBase optional proxy base
 * @returns response text
 */
export async function fetchWmsText(url: string, proxyBase: string): Promise<string> {
  const target = viaProxy(url, proxyBase);
  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

/**
 * Fetch and parse JSON from a WMS metadata endpoint.
 *
 * @param url absolute remote URL
 * @param proxyBase optional proxy base
 * @returns parsed JSON
 */
export async function fetchWmsJson<T>(url: string, proxyBase: string): Promise<T> {
  const text = await fetchWmsText(url, proxyBase);
  if (text.startsWith("Failed to call:") || text.trim().startsWith("<")) {
    throw new Error(text.slice(0, 200));
  }
  return JSON.parse(text) as T;
}

/**
 * Build ncWMS GetMetadata URL for layerDetails.
 *
 * @param layer layer config
 * @returns absolute URL
 */
export function layerDetailsUrl(layer: LayerConfig): string {
  return `${layer.server}?${paramsToQuery({
    REQUEST: "GetMetadata",
    item: "layerDetails",
    layerName: layer.name,
  })}`;
}

/**
 * Build GetMetadata timesteps URL for a calendar day.
 *
 * @param layer layer config
 * @param day ISO date yyyy-MM-dd
 * @returns absolute URL
 */
export function timestepsUrl(layer: LayerConfig, day: string): string {
  return `${layer.server}?${paramsToQuery({
    REQUEST: "GetMetadata",
    item: "timesteps",
    layerName: layer.name,
    day,
  })}`;
}

/**
 * Build animationTimesteps metadata URL.
 *
 * @param layer layer config
 * @param start ISO start timestamp on the axis
 * @param end ISO end timestamp on the axis
 * @returns absolute URL
 */
export function animationTimestepsUrl(layer: LayerConfig, start: string, end: string): string {
  return `${layer.server}?${paramsToQuery({
    REQUEST: "GetMetadata",
    item: "animationTimesteps",
    layerName: layer.name,
    start,
    end,
  })}`;
}

/**
 * Build GetMetadata minmax URL for Auto color range.
 *
 * @param layer layer config
 * @param opts bbox, time, elevation, styles
 * @returns absolute URL
 */
export function minMaxUrl(
  layer: LayerConfig,
  opts: {
    bbox: string;
    srs: string;
    time?: string;
    elevation?: string | number;
    styles?: string;
  },
): string {
  // ncWMS GetMetadata minmax expects WMS 1.1.1-style lon,lat BBOX.
  return `${layer.server}?${paramsToQuery({
    request: "GetMetadata",
    version: "1.1.1",
    layers: layer.name,
    width: 100,
    height: 100,
    item: "minmax",
    bbox: opts.bbox,
    srs: opts.srs,
    styles: opts.styles ?? layer.style,
    time: opts.time,
    elevation: opts.elevation,
  })}`;
}

/**
 * Build a WMS GetMap URL for the main layer image.
 *
 * @param layer layer config
 * @param opts map request options
 * @returns absolute GetMap URL
 */
export function getMapUrl(
  layer: LayerConfig,
  opts: {
    bbox: string;
    width: number;
    height: number;
    srs: string;
    time?: string;
    elevation?: string | number;
    colorscalerange?: string;
    palette?: string;
    styles?: string;
  },
): string {
  const palette = opts.palette ?? layer.palette;
  const styleBase = opts.styles ?? layer.style;
  const styles = layer.ncWms ? `${styleBase}/${palette}` : styleBase;
  return `${layer.server}?${paramsToQuery({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer.name,
    STYLES: styles,
    CRS: opts.srs,
    BBOX: opts.bbox,
    WIDTH: opts.width,
    HEIGHT: opts.height,
    FORMAT: layer.format || "image/png",
    TRANSPARENT: "true",
    TIME: opts.time,
    ELEVATION: opts.elevation,
    COLORSCALERANGE: opts.colorscalerange,
    NUMCOLORBANDS: 250,
  })}`;
}

/**
 * Build GetLegendGraphic URL for the palette strip.
 *
 * @param layer layer config
 * @param palette palette name
 * @returns legend URL
 */
export function legendUrl(layer: LayerConfig, palette: string): string {
  return `${layer.server}?${paramsToQuery({
    REQUEST: "GetLegendGraphic",
    LAYER: layer.name,
    PALETTE: palette,
    COLORBARONLY: "true",
    WIDTH: 20,
    HEIGHT: 120,
    NUMCOLORBANDS: 250,
  })}`;
}

/**
 * Build GetFeatureInfo URL for punctual identify.
 *
 * @param layer layer config
 * @param opts click / map params
 * @returns absolute URL
 */
export function getFeatureInfoUrl(
  layer: LayerConfig,
  opts: {
    bbox: string;
    width: number;
    height: number;
    x: number;
    y: number;
    srs: string;
    time?: string;
    elevation?: string | number;
    infoFormat?: string;
  },
): string {
  return `${layer.server}?${paramsToQuery({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetFeatureInfo",
    LAYERS: layer.name,
    QUERY_LAYERS: layer.name,
    CRS: opts.srs,
    BBOX: opts.bbox,
    WIDTH: opts.width,
    HEIGHT: opts.height,
    I: opts.x,
    J: opts.y,
    INFO_FORMAT: opts.infoFormat ?? "text/xml",
    TIME: opts.time,
    ELEVATION: opts.elevation,
  })}`;
}

/**
 * Build ncWMS GetTimeseries URL for a map click.
 *
 * @param layer layer config
 * @param opts map click / time range params
 * @returns absolute URL
 */
export function getTimeseriesUrl(
  layer: LayerConfig,
  opts: {
    bbox: string;
    width: number;
    height: number;
    x: number;
    y: number;
    srs: string;
    timeRange: string;
    elevation?: string | number;
    /** `text/csv` for dynamic charts; `image/png` for static plot image */
    infoFormat?: "text/csv" | "image/png";
  },
): string {
  const infoFormat = opts.infoFormat ?? "image/png";
  return `${layer.server}?${paramsToQuery({
    REQUEST: "GetTimeseries",
    LAYERS: layer.name,
    QUERY_LAYERS: layer.name,
    STYLES: "default/default",
    SRS: opts.srs,
    BBOX: opts.bbox,
    WIDTH: opts.width,
    HEIGHT: opts.height,
    X: opts.x,
    Y: opts.y,
    TIME: opts.timeRange,
    ELEVATION: opts.elevation,
    FORMAT: infoFormat === "text/csv" ? "text/csv" : "image/png",
    INFO_FORMAT: infoFormat,
    VERSION: "1.1.1",
  })}`;
}

/**
 * Build ncWMS GetVerticalProfile URL for a map click.
 *
 * @param layer layer config
 * @param opts map click / time params
 * @returns absolute URL
 */
export function getVerticalProfileUrl(
  layer: LayerConfig,
  opts: {
    bbox: string;
    width: number;
    height: number;
    x: number;
    y: number;
    srs: string;
    time?: string;
    /** `text/csv` for dynamic charts; `image/png` for static plot image */
    infoFormat?: "text/csv" | "image/png";
  },
): string {
  const infoFormat = opts.infoFormat ?? "image/png";
  return `${layer.server}?${paramsToQuery({
    REQUEST: "GetVerticalProfile",
    LAYERS: layer.name,
    QUERY_LAYERS: layer.name,
    STYLES: "default/default",
    SRS: opts.srs,
    BBOX: opts.bbox,
    WIDTH: opts.width,
    HEIGHT: opts.height,
    X: opts.x,
    Y: opts.y,
    TIME: opts.time,
    FORMAT: infoFormat === "text/csv" ? "text/csv" : "image/png",
    INFO_FORMAT: infoFormat,
    VERSION: "1.1.1",
  })}`;
}

export type NcwmsLayerDetails = {
  name?: string;
  units?: string;
  scaleRange?: [number | string, number | string];
  palettes?: string[];
  defaultPalette?: string;
  supportedStyles?: string[];
  datesWithData?: Record<string, Record<string, number[]>>;
  nearestTimeIso?: string;
  bbox?: number[];
  srs?: string;
  zaxis?: { units?: string; values: Array<number | string> };
  layerType?: string;
  [key: string]: unknown;
};

/**
 * Load layerDetails for a layer, using baked cache when present.
 *
 * @param layer layer config
 * @param settings site settings (proxy)
 * @param baked optional baked JSON
 * @returns layer details object
 */
export async function loadLayerDetails(
  layer: LayerConfig,
  settings: SiteSettings,
  baked?: unknown,
): Promise<NcwmsLayerDetails> {
  if (baked && typeof baked === "object") {
    return baked as NcwmsLayerDetails;
  }
  if (!layer.ncWms) {
    return {
      name: layer.name,
      bbox: layer.bbox,
      srs: layer.projection,
      scaleRange: [
        layer.minColor ?? 0,
        layer.maxColor ?? 1,
      ],
      palettes: [layer.palette],
      defaultPalette: layer.palette,
      supportedStyles: [layer.style],
    };
  }
  const details = await fetchWmsJson<NcwmsLayerDetails>(
    layerDetailsUrl(layer),
    settings.proxyBase,
  );
  details.server = layer.server;
  details.name = layer.name;
  details.ncwmstwo = layer.ncWmsTwo;
  details.overlayStreamlines = layer.overlayStreamlines;
  details.defParticleSpeed = layer.defParticleSpeed;
  if (layer.minColor !== undefined && layer.maxColor !== undefined && details.scaleRange) {
    details.scaleRange = [layer.minColor, layer.maxColor];
  }
  return details;
}
