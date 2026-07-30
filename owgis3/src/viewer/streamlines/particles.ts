/**
 * Canvas 2D particle engine — close port of OWGIS 2 particles.js (non-Cesium path).
 */
import type { GridInfo, Particle, UvGrid, UvSample } from "./types";

const DEF_NUM_PARTICLES = 15000;
const DEF_TIME_PARTICLE = 80;
const DEF_PARTICLE_SPEED = 0.0003;
/** Internal OWGIS scale applied on top of configured particle speed. */
const SPEED_SCALE = 2.5;

/**
 * Mutable particle simulation state shared with the animation controller.
 */
export class ParticleEngine {
  private particles: Particle[] = [];
  private grids: Array<UvGrid | undefined> = [];
  private gridInfo: GridInfo | null = null;
  private currentExtent: [number, number, number, number] = [0, 0, 1, 1];
  private currentGrid = 0;
  private numParticles = DEF_NUM_PARTICLES;
  private timeParticle = DEF_TIME_PARTICLE;
  private particleSpeed = DEF_PARTICLE_SPEED;
  private defaultParticleSpeed = DEF_PARTICLE_SPEED;
  private resolutionParticleSpeed = DEF_PARTICLE_SPEED;
  private limLonMin = 0;
  private limLatMin = 0;
  private lonDomainRand = 1;
  private latDomainRand = 1;
  private lonDomain = 1;
  private latDomain = 1;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  /**
   * Bind the drawing surface used by drawParticles.
   *
   * @param canvas target canvas
   */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  /**
   * Initialize domains and spawn particles for a new grid / map extent.
   *
   * @param gridInfo CoverageJSON domain header
   * @param currentExtent visible map extent [minX, minY, maxX, maxY]
   * @param layerBbox layer data extent in map CRS
   */
  initData(
    gridInfo: GridInfo,
    currentExtent: [number, number, number, number],
    layerBbox: [number, number, number, number],
  ): void {
    this.gridInfo = gridInfo;
    this.currentExtent = currentExtent;
    this.lonDomain = Math.abs(currentExtent[0] - currentExtent[2]);
    this.latDomain = Math.abs(currentExtent[1] - currentExtent[3]);
    this.updateDomains(layerBbox);
    this.initParticles();
  }

  /**
   * Restrict spawn domain to intersection of layer bbox and vector grid.
   *
   * @param layerBbox layer extent in map CRS
   */
  private updateDomains(layerBbox: [number, number, number, number]): void {
    if (!this.gridInfo) {
      return;
    }
    this.limLatMin = Math.max(layerBbox[1], this.gridInfo.la1);
    this.limLonMin = Math.max(layerBbox[0], this.gridInfo.lo1);
    const limLonMax = Math.min(layerBbox[2], this.gridInfo.lo2);
    const limLatMax = Math.min(layerBbox[3], this.gridInfo.la2);
    this.lonDomainRand = Math.abs(this.limLonMin - limLonMax);
    this.latDomainRand = Math.abs(this.limLatMin - limLatMax);
  }

  /** Clear multi-time grids. */
  clearGrids(): void {
    this.grids = [];
  }

  /**
   * Store a UV grid for a time index.
   *
   * @param grid UV field
   * @param idx time index
   */
  setGrid(grid: UvGrid, idx: number): void {
    this.grids[idx] = grid;
  }

  /**
   * Select which time grid is active (resets trilinear clock).
   *
   * @param idx grid index
   */
  setCurrentGrid(idx: number): void {
    this.currentGrid = idx;
  }

  /**
   * @param tot number of particles
   */
  setNumParticles(tot: number): void {
    this.numParticles = tot;
    this.initParticles();
  }

  /** @returns current particle count */
  getNumParticles(): number {
    return this.numParticles;
  }

  /** @returns default particle count */
  getDefaultNumParticles(): number {
    return DEF_NUM_PARTICLES;
  }

  /**
   * @param speed particle speed multiplier
   */
  setParticleSpeed(speed: number): void {
    this.particleSpeed = speed;
  }

  /** @returns active particle speed */
  getParticleSpeed(): number {
    return this.particleSpeed;
  }

  /**
   * @param speed XML / config default speed
   */
  setDefaultParticleSpeed(speed: number): void {
    this.defaultParticleSpeed = speed > 0 ? speed : DEF_PARTICLE_SPEED;
  }

  /** @returns configured default speed */
  getDefaultParticleSpeed(): number {
    return this.defaultParticleSpeed;
  }

  /**
   * @param speed resolution-scaled speed (also applied as live speed)
   */
  setCurrentResolutionParticleSpeed(speed: number): void {
    this.resolutionParticleSpeed = speed;
    this.particleSpeed = speed;
  }

  /** @returns resolution-scaled speed */
  getCurrentResolutionParticleSpeed(): number {
    return this.resolutionParticleSpeed;
  }

  /**
   * @param tot particle lifetime in frames
   */
  setParticlesLifeTime(tot: number): void {
    this.timeParticle = tot;
    this.initParticles();
  }

  /** @returns lifetime in frames */
  getParticlesLifeTime(): number {
    return this.timeParticle;
  }

  /** @returns default lifetime */
  getDefaultParticlesLifeTime(): number {
    return DEF_TIME_PARTICLE;
  }

  /** @returns particles array length */
  get length(): number {
    return this.particles.length;
  }

  /**
   * Advect particles using bilinear sampling of the current UV grid.
   * Port of owgis.ncwms.currents.particles.updateParticles (single-grid path).
   *
   * @param i start index (inclusive)
   * @param j end index (exclusive)
   */
  updateParticles(i: number, j: number): void {
    const grid = this.grids[this.currentGrid];
    const info = this.gridInfo;
    if (!grid || !info) {
      return;
    }
    const localParticleSpeed = SPEED_SCALE * this.particleSpeed;
    const { lo1, la1, lo2, la2, dx, dy, nx, ny } = info;

    for (let idx = j - 1; i <= idx; idx--) {
      const particle = this.particles[idx];
      particle[0] = particle[2];
      particle[1] = particle[3];
      if (particle[4] > this.timeParticle) {
        this.particles[idx] = this.randomParticle();
        continue;
      }

      if (particle[0] > lo1 && particle[1] > la1 && particle[0] < lo2 && particle[1] < la2) {
        const row = (particle[1] - la1) / dy;
        const col = (particle[0] - lo1) / dx;
        const row1 = ny - 1 - Math.floor(row);
        const col1 = Math.floor(col);
        const row2 = Math.max(row1 - 1, 0);
        const col2 = Math.min(col1 + 1, nx - 1);
        const q11 = grid[row1][col1];
        const q12 = grid[row2][col1];
        const q21 = grid[row1][col2];
        const q22 = grid[row2][col2];
        if (q11[0] === null || q12[0] === null || q21[0] === null || q22[0] === null) {
          this.particles[idx] = this.randomParticle();
        } else {
          const x1 = lo1 + col1 * dx;
          const x2 = x1 + dx;
          const y1 = la1 + (ny - 1 - row1) * dy;
          const y2 = y1 + dy;
          const uv = this.bilinearInterpolation(particle, x1, x2, y1, y2, q11, q21, q12, q22);
          particle[2] = particle[0] + localParticleSpeed * uv[0];
          particle[3] = particle[1] + localParticleSpeed * uv[1];
        }
      } else {
        this.particles[idx] = this.randomParticle();
      }
      particle[4]++;
    }
  }

  /**
   * Queue line segments for all particles onto the shared canvas path.
   *
   * @param i start index
   * @param j end index
   */
  drawParticles(i: number, j: number): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) {
      return;
    }
    for (let idx = i; idx < j; idx++) {
      const particle = this.particles[idx];
      const pix = this.particleToCanvas(particle);
      ctx.moveTo(pix[0], pix[1]);
      ctx.lineTo(pix[2], pix[3]);
    }
  }

  /**
   * Map CRS particle positions into canvas pixels.
   *
   * @param particle particle state
   * @returns [x0, y0, x1, y1] in pixels
   */
  private particleToCanvas(particle: Particle): [number, number, number, number] {
    const canvas = this.canvas!;
    const extent = this.currentExtent;
    const x = ((particle[0] - extent[0]) / this.lonDomain) * canvas.width;
    const y = canvas.height - ((particle[1] - extent[1]) / this.latDomain) * canvas.height;
    const dx = ((particle[2] - extent[0]) / this.lonDomain) * canvas.width;
    const dy = canvas.height - ((particle[3] - extent[1]) / this.latDomain) * canvas.height;
    return [x, y, dx, dy];
  }

  /**
   * Uniform random spawn inside the spawn domain.
   *
   * @returns new particle
   */
  private randomParticle(): Particle {
    const x = this.limLonMin + Math.random() * this.lonDomainRand;
    const y = this.limLatMin + Math.random() * this.latDomainRand;
    const t = Math.random() * this.timeParticle;
    return [x, y, x, y, t];
  }

  /**
   * Wikipedia-style bilinear interpolation of U and V (OWGIS 2 formula).
   *
   * @param particle sample location
   * @param x1 left cell edge
   * @param x2 right cell edge
   * @param y1 bottom cell edge
   * @param y2 top cell edge
   * @param q11 SW sample
   * @param q21 SE sample
   * @param q12 NW sample
   * @param q22 NE sample
   * @returns [u, v]
   */
  private bilinearInterpolation(
    particle: Particle,
    x1: number,
    x2: number,
    y1: number,
    y2: number,
    q11: UvSample,
    q21: UvSample,
    q12: UvSample,
    q22: UvSample,
  ): [number, number] {
    const info = this.gridInfo!;
    const x2_x = x2 - particle[0];
    const y2_y = y2 - particle[1];
    const x_x1 = particle[0] - x1;
    const y_y1 = particle[1] - y1;
    const a = x2_x * y2_y;
    const b = x_x1 * y2_y;
    const c = x2_x * y_y1;
    const d = x_x1 * y_y1;
    const e = info.dx * info.dy;
    const u = (Number(q11[0]) * a + Number(q21[0]) * b + Number(q12[0]) * c + Number(q22[0]) * d) / e;
    const v = (Number(q11[1]) * a + Number(q21[1]) * b + Number(q12[1]) * c + Number(q22[1]) * d) / e;
    return [u, v];
  }

  /** Allocate / reseed the particle array. */
  private initParticles(): void {
    this.particles = new Array(this.numParticles);
    for (let i = 0; i < this.numParticles; i++) {
      this.particles[i] = this.randomParticle();
    }
  }
}

/**
 * Scale particle speed from map resolution (OWGIS 2 StreamlinesStyle).
 *
 * @param resolution view resolution
 * @param defaultSpeed XML defParticleSpeed
 * @returns scaled speed
 */
export function particleSpeedFromResolution(resolution: number, defaultSpeed: number): number {
  return Math.pow(resolution, 1.01) * defaultSpeed;
}
