/**
 * Types for the OWGIS2-style CoverageJSON → particle streamlines pipeline.
 */

/** Header describing a U/V vector grid in map CRS units. */
export interface GridInfo {
  la1: number;
  la2: number;
  lo1: number;
  lo2: number;
  nx: number;
  ny: number;
  dx: number;
  dy: number;
}

/** One UV sample; null components mean land / no data. */
export type UvSample = [number | null, number | null];

/** Row-major UV grid (row 0 = northernmost after buildGrid flip). */
export type UvGrid = UvSample[][];

/**
 * Particle state: [x0, y0, x1, y1, age] in map CRS.
 * (x0,y0) previous position; (x1,y1) new; age in frames.
 */
export type Particle = [number, number, number, number, number];

/** Minimal CoverageJSON shape returned by ncWMS2 GetMap. */
export interface CoverageJson {
  domain: {
    axes: {
      x: { start: number; stop: number; num: number };
      y: { start: number; stop: number; num: number };
    };
  };
  ranges: Record<string, { values: Array<number | null> }>;
}
