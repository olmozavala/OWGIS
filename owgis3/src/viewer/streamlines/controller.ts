/**
 * Streamlines controller — port of AnimationStreamlines.js (2D canvas overlay path).
 * Particles use the same CoverageJSON → bilinear advection loop as OWGIS 2.
 */
import Map from "ol/Map";
import { transformExtent } from "ol/proj";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type { LayerConfig } from "../../shared/config/types";
import {
  buildGrid,
  buildGridInfo,
  coverageGetMapUrl,
  coverageValues,
  fetchCoverageJson,
} from "./coverageJson";
import { ParticleEngine, particleSpeedFromResolution } from "./particles";
import type { GridInfo } from "./types";

const ANIM_MS = 80;
const IMAGE_REQUEST_RESOLUTION = 800;
const DEF_COLOR = "rgba(255, 255, 255, 0.6)";
const DEF_LINE_WIDTH = 1.7;
const FADE_FILL = "rgba(255, 255, 255, 0.1)";

export type StreamlinesStatusFn = (text: string) => void;

/**
 * Options passed when (re)starting a single-date streamline animation.
 */
export interface StreamlinesStartOpts {
  time?: string;
  elevation?: string | number;
  proxyBase: string;
}

/**
 * Manages CoverageJSON U/V fetch and particle drawing on #currentsCanvas over the map.
 */
export class StreamlinesController {
  private readonly map: Map;
  private readonly engine = new ParticleEngine();
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private paused = false;
  private color = DEF_COLOR;
  private opacity = 1;
  private mainLayer: LayerConfig | null = null;
  private streamPair: [string, string] | null = null;
  private layerBbox3857: [number, number, number, number] = [0, 0, 1, 1];
  private currentExtent: [number, number, number, number] = [0, 0, 1, 1];
  private lastResolution = 0;
  private gridInfo: GridInfo | null = null;
  private opts: StreamlinesStartOpts | null = null;
  private status: StreamlinesStatusFn;
  private fetchGeneration = 0;
  private running = false;
  private lastFetchZoom = Number.NaN;
  private intervalId: number | undefined;
  private abort: AbortController | null = null;
  private moveEndKey: EventsKey | null = null;

  /**
   * @param map OpenLayers map
   * @param canvas DOM canvas (#currentsCanvas)
   * @param status optional status callback
   */
  constructor(map: Map, canvas: HTMLCanvasElement, status: StreamlinesStatusFn = () => undefined) {
    this.map = map;
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable for streamlines");
    }
    this.ctx = ctx;
    this.engine.setCanvas(canvas);
    this.status = status;
    this.mountCanvasUnderOverlays();
    this.moveEndKey = map.on("moveend", () => this.onMoveEnd());
  }

  /**
   * Place the particle canvas inside the OL viewport, before overlay containers,
   * so identify popups and other overlays paint above streamlines.
   */
  private mountCanvasUnderOverlays(): void {
    const viewport = this.map.getViewport();
    const stopEvent = viewport.querySelector(".ol-overlaycontainer-stopevent");
    if (stopEvent?.parentElement === viewport) {
      viewport.insertBefore(this.canvas, stopEvent);
      return;
    }
    const overlays = viewport.querySelector(".ol-overlaycontainer");
    if (overlays?.parentElement === viewport) {
      viewport.insertBefore(this.canvas, overlays);
      return;
    }
    viewport.appendChild(this.canvas);
  }

  /**
   * Start (or restart) streamlines for the given main layer.
   *
   * @param mainLayer layer that carries overlayStreamlines
   * @param opts time / elevation / proxy
   */
  start(mainLayer: LayerConfig, opts: StreamlinesStartOpts): void {
    if (!mainLayer.overlayStreamlines || !mainLayer.ncWmsTwo) {
      this.stop();
      return;
    }
    const parts = mainLayer.overlayStreamlines.split(":");
    if (parts.length < 2) {
      this.stop();
      return;
    }
    this.stop(false);
    this.mainLayer = mainLayer;
    this.streamPair = [parts[0], parts[1]];
    this.opts = opts;
    this.paused = false;
    this.running = true;

    const defSpeed = mainLayer.defParticleSpeed ?? 0.0003;
    this.engine.setDefaultParticleSpeed(defSpeed);

    let bbox = [...mainLayer.bbox] as [number, number, number, number];
    if (bbox[0] === -180 && bbox[2] === 180) {
      bbox = [-540, bbox[1], 540, bbox[3]];
    }
    this.layerBbox3857 = transformExtent(bbox, "EPSG:4326", "EPSG:3857") as [
      number,
      number,
      number,
      number,
    ];

    this.canvas.classList.add("active");
    this.syncCanvasToMap();
    this.status("Loading streamlines…");
    void this.fetchField(true);
  }

  /**
   * Stop animation and hide the overlay canvas.
   *
   * @param hideCanvas whether to hide the canvas (default true)
   */
  stop(hideCanvas = true): void {
    this.running = false;
    this.clearInterval();
    this.abort?.abort();
    this.abort = null;
    this.engine.clearGrids();
    this.engine.setCurrentGrid(0);
    this.gridInfo = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (hideCanvas) {
      this.canvas.classList.remove("active");
    }
  }

  /** Detach map listeners. */
  dispose(): void {
    this.stop(true);
    if (this.moveEndKey) {
      unByKey(this.moveEndKey);
      this.moveEndKey = null;
    }
  }

  /**
   * Toggle or set play/pause.
   *
   * @param pause optional explicit pause state
   */
  playPause(pause?: boolean): void {
    this.paused = typeof pause === "boolean" ? pause : !this.paused;
  }

  /** @returns whether animation is paused */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * @param color CSS stroke color
   */
  setColor(color: string): void {
    this.color = color;
    this.repaintNow();
  }

  /** @returns stroke color */
  getColor(): string {
    return this.color;
  }

  /**
   * Set particle stroke opacity (0–1). Applied via canvas context, not CSS,
   * so it does not fight strokeStyle alpha.
   *
   * @param opacity opacity
   */
  setOpacity(opacity: number): void {
    this.opacity = Math.min(1, Math.max(0, opacity));
    this.canvas.style.opacity = "1";
    this.repaintNow();
  }

  /**
   * Clear trails and draw one frame immediately (so color/opacity changes
   * are visible even while the animation is paused).
   */
  repaintNow(): void {
    if (!this.running) {
      return;
    }
    const { ctx, canvas, engine } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = this.opacity;
    ctx.lineWidth = DEF_LINE_WIDTH;
    engine.drawParticles(0, engine.length);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** @returns particle engine for UI sliders */
  getEngine(): ParticleEngine {
    return this.engine;
  }

  /**
   * Update TIME / ELEVATION and refetch the vector field.
   *
   * @param opts partial options to merge
   */
  updateParams(opts: Partial<StreamlinesStartOpts>): void {
    if (!this.running || !this.opts) {
      return;
    }
    this.opts = { ...this.opts, ...opts };
    void this.fetchField(true);
  }

  /** Handle pan/zoom: re-seed particles; refetch on significant zoom change. */
  private onMoveEnd(): void {
    if (!this.running) {
      return;
    }
    this.syncCanvasToMap();
    const zoom = this.map.getView().getZoom() ?? 0;
    const zoomJump = Number.isNaN(this.lastFetchZoom) || Math.abs(zoom - this.lastFetchZoom) >= 0.45;
    if (zoomJump) {
      void this.fetchField(false);
    } else if (this.gridInfo) {
      this.engine.initData(this.gridInfo, this.currentExtent, this.layerBbox3857);
    }
  }

  /**
   * Match canvas pixel size and CRS extent to the map viewport.
   */
  private syncCanvasToMap(): void {
    const size = this.map.getSize();
    if (!size) {
      return;
    }
    const width = Math.max(1, Math.floor(size[0]));
    const height = Math.max(1, Math.floor(size[1]));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.currentExtent = this.map.getView().calculateExtent(size) as [
      number,
      number,
      number,
      number,
    ];
    const resolution = this.map.getView().getResolution() ?? 0;
    if (resolution > 0 && Math.abs(resolution - this.lastResolution) > 1e-6) {
      this.lastResolution = resolution;
      this.engine.setCurrentResolutionParticleSpeed(
        particleSpeedFromResolution(resolution, this.engine.getDefaultParticleSpeed()),
      );
    }
  }

  /**
   * Fetch U and V CoverageJSON for the current view ∩ layer bbox.
   *
   * @param force always refetch
   */
  private async fetchField(_force: boolean): Promise<void> {
    if (!this.running || !this.mainLayer || !this.streamPair || !this.opts) {
      return;
    }
    this.syncCanvasToMap();
    const requestBbox = this.intersectBbox(this.currentExtent, this.layerBbox3857);
    if (!requestBbox) {
      this.status("Streamlines outside layer extent");
      return;
    }

    this.abort?.abort();
    this.abort = new AbortController();
    const gen = ++this.fetchGeneration;
    const signal = this.abort.signal;
    const { width, height } = this.requestSize();
    const common = {
      server: this.mainLayer.server,
      bbox: requestBbox.join(","),
      width,
      height,
      crs: "EPSG:3857",
      time: this.opts.time,
      elevation: this.opts.elevation,
    };

    try {
      this.status("Loading streamlines…");
      const [uJson, vJson] = await Promise.all([
        fetchCoverageJson(
          coverageGetMapUrl({ ...common, layerName: this.streamPair[0] }),
          this.opts.proxyBase,
          signal,
        ),
        fetchCoverageJson(
          coverageGetMapUrl({ ...common, layerName: this.streamPair[1] }),
          this.opts.proxyBase,
          signal,
        ),
      ]);
      if (gen !== this.fetchGeneration) {
        return;
      }
      const info = buildGridInfo(uJson);
      const grid = buildGrid(info, coverageValues(uJson), coverageValues(vJson));
      this.gridInfo = info;
      this.engine.clearGrids();
      this.engine.setCurrentGrid(0);
      this.engine.setGrid(grid, 0);
      this.engine.initData(info, this.currentExtent, this.layerBbox3857);

      const zoom = this.map.getView().getZoom() ?? 5;
      const count = zoom < 2 ? 2000 : zoom < 4 ? 10000 : 15000;
      this.engine.setNumParticles(count);
      this.lastFetchZoom = zoom;

      this.startLoop();
      this.status("");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      this.status(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Compute request width/height from window size (OWGIS 2 updateWidthAndHeight).
   *
   * @returns pixel size for CoverageJSON GetMap
   */
  private requestSize(): { width: number; height: number } {
    const width = Math.ceil((window.innerWidth / 800) * IMAGE_REQUEST_RESOLUTION);
    const height = Math.ceil((window.innerHeight / 800) * IMAGE_REQUEST_RESOLUTION);
    return {
      width: Math.max(32, Math.min(width, 900)),
      height: Math.max(32, Math.min(height, 900)),
    };
  }

  /**
   * Intersect view extent with layer data extent.
   *
   * @param view view extent
   * @param layer layer extent
   * @returns intersection or null if disjoint
   */
  private intersectBbox(
    view: [number, number, number, number],
    layer: [number, number, number, number],
  ): [number, number, number, number] | null {
    if (view[0] > layer[2] || view[2] < layer[0] || view[1] > layer[3] || view[3] < layer[1]) {
      return null;
    }
    return [
      Math.max(view[0], layer[0]),
      Math.max(view[1], layer[1]),
      Math.min(view[2], layer[2]),
      Math.min(view[3], layer[3]),
    ];
  }

  /** Start the 80 ms fade / update / draw loop. */
  private startLoop(): void {
    this.clearInterval();
    this.intervalId = window.setInterval(() => this.loop(), ANIM_MS);
  }

  private clearInterval(): void {
    if (this.intervalId !== undefined) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * One animation frame: trail fade, advect, stroke (OWGIS 2 loopAnimationCurrents).
   */
  private loop(): void {
    if (this.paused || !this.running) {
      return;
    }
    const { ctx, canvas, engine } = this;
    ctx.beginPath();
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = FADE_FILL;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = prev;
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = this.opacity;
    ctx.lineWidth = DEF_LINE_WIDTH;
    engine.updateParticles(0, engine.length);
    engine.drawParticles(0, engine.length);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
