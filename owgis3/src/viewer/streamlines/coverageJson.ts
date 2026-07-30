/**
 * ncWMS2 CoverageJSON helpers — port of NcWMSTwo.js.
 */
import { viaProxy } from "../../shared/wms/client";
import type { CoverageJson, GridInfo, UvGrid, UvSample } from "./types";

/**
 * Build grid header from CoverageJSON domain axes.
 *
 * @param data CoverageJSON payload from ncWMS GetMap
 * @returns grid info in the request CRS
 */
export function buildGridInfo(data: CoverageJson): GridInfo {
  const la1 = data.domain.axes.y.start;
  const la2 = data.domain.axes.y.stop;
  const lo1 = data.domain.axes.x.start;
  const lo2 = data.domain.axes.x.stop;
  const ny = data.domain.axes.y.num;
  const nx = data.domain.axes.x.num;
  return {
    la1,
    la2,
    lo1,
    lo2,
    ny,
    nx,
    dy: (la2 - la1) / ny,
    dx: (lo2 - lo1) / nx,
  };
}

/**
 * Interleave flat U and V CoverageJSON ranges into a 2D UV grid.
 * Rows are flipped so index 0 is the northernmost row (OWGIS 2 convention).
 *
 * @param gridInfo domain header
 * @param uData flat U values (row-major, south→north as returned)
 * @param vData flat V values
 * @returns UV grid
 */
export function buildGrid(
  gridInfo: GridInfo,
  uData: Array<number | null>,
  vData: Array<number | null>,
): UvGrid {
  const grid: UvGrid = new Array(gridInfo.ny);
  let p = 0;
  for (let j = 0; j < gridInfo.ny; j++) {
    const row: UvSample[] = new Array(gridInfo.nx);
    for (let i = 0; i < gridInfo.nx; i++, p++) {
      row[i] = [uData[p] ?? null, vData[p] ?? null];
    }
    grid[gridInfo.ny - 1 - j] = row;
  }
  return grid;
}

/**
 * Extract the first range's values from a CoverageJSON document.
 *
 * @param data CoverageJSON
 * @returns flat value array
 */
export function coverageValues(data: CoverageJson): Array<number | null> {
  const keys = Object.keys(data.ranges);
  if (!keys.length) {
    return [];
  }
  return data.ranges[keys[0]].values;
}

/**
 * Build a GetMap URL for CoverageJSON of one U or V layer.
 *
 * @param opts request parameters
 * @returns absolute GetMap URL
 */
export function coverageGetMapUrl(opts: {
  server: string;
  layerName: string;
  bbox: string;
  width: number;
  height: number;
  crs: string;
  time?: string;
  elevation?: string | number;
}): string {
  const params = new URLSearchParams({
    REQUEST: "GetMap",
    SERVICE: "WMS",
    VERSION: "1.3.0",
    LAYERS: opts.layerName,
    STYLES: "",
    FORMAT: "application/prs.coverage+json",
    CRS: opts.crs,
    BBOX: opts.bbox,
    WIDTH: String(opts.width),
    HEIGHT: String(opts.height),
  });
  if (opts.time) {
    params.set("TIME", opts.time);
  }
  if (opts.elevation !== undefined && opts.elevation !== "") {
    params.set("ELEVATION", String(opts.elevation));
  }
  const sep = opts.server.includes("?") ? "&" : "?";
  return `${opts.server}${sep}${params.toString()}`;
}

/**
 * Fetch CoverageJSON through the optional CORS proxy.
 *
 * @param url absolute GetMap URL
 * @param proxyBase proxy base (e.g. `/proxy`)
 * @param signal optional abort signal
 * @returns parsed CoverageJSON
 */
export async function fetchCoverageJson(
  url: string,
  proxyBase: string,
  signal?: AbortSignal,
): Promise<CoverageJson> {
  const target = viaProxy(url, proxyBase);
  const response = await fetch(target, { signal, headers: { Accept: "application/json, application/prs.coverage+json, */*" } });
  if (!response.ok) {
    throw new Error(`CoverageJSON HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as CoverageJson;
}
