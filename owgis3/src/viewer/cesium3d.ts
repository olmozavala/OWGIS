/**
 * OpenLayers ↔ Cesium 3D globe toggle (OWGIS 2 CesiumOwgis.js / ol-cesium).
 */

import type OlMap from "ol/Map";
import type OLCesiumType from "olcs";

export type CesiumController = {
  /** Whether the globe is currently shown. */
  isEnabled: () => boolean;
  /** Toggle 2D map ↔ 3D globe. */
  toggle: () => Promise<boolean>;
};

type CesiumNamespace = typeof import("cesium");

/** Soft upper zoom-out limit (meters), matching OWGIS 2. */
const MAX_ZOOM_DISTANCE_M = 8_500_000;

/**
 * Create a lazy Cesium controller bound to an OpenLayers map.
 * Cesium + olcs are loaded on first toggle to keep the initial viewer light.
 *
 * @param map OpenLayers map
 * @returns controller with toggle / isEnabled
 */
export function createCesiumController(map: OlMap): CesiumController {
  let ol3d: OLCesiumType | null = null;
  let loading: Promise<void> | null = null;

  /**
   * Dynamically import Cesium + olcs and build the OLCesium bridge.
   *
   * @returns void when ready
   */
  async function ensureInitialized(): Promise<void> {
    if (ol3d) {
      return;
    }
    if (loading) {
      await loading;
      return;
    }
    loading = (async () => {
      const Cesium = await import("cesium");
      await import("cesium/Build/Cesium/Widgets/widgets.css");
      (window as unknown as { Cesium: CesiumNamespace }).Cesium = Cesium;

      // olcs expects a global Cesium and a default-export constructor.
      const olcsMod = await import("olcs");
      const OLCesiumCtor =
        (olcsMod as { default?: new (opts: { map: OlMap }) => OLCesiumType }).default
        ?? (olcsMod as unknown as new (opts: { map: OlMap }) => OLCesiumType);
      ol3d = new OLCesiumCtor({ map });
      const scene = ol3d.getCesiumScene();
      // Match OWGIS 2 defaults: no atmosphere fringe, limited zoom-out.
      // Allow tilt so the sphere is obvious (OWGIS 2 disabled tilt; we keep
      // a light tilt available for exploration).
      if (scene.skyAtmosphere) {
        scene.skyAtmosphere.show = false;
      }
      scene.screenSpaceCameraController.enableTilt = true;
      scene.screenSpaceCameraController.maximumZoomDistance = MAX_ZOOM_DISTANCE_M;
    })();
    try {
      await loading;
    } finally {
      loading = null;
    }
  }

  return {
    isEnabled: (): boolean => ol3d?.getEnabled() ?? false,
    toggle: async (): Promise<boolean> => {
      await ensureInitialized();
      if (!ol3d) {
        throw new Error("Cesium failed to initialize");
      }
      const next = !ol3d.getEnabled();
      ol3d.setEnabled(next);
      // Force OL / Cesium to pick up container size after the swap.
      window.setTimeout(() => {
        map.updateSize();
      }, 0);
      return next;
    },
  };
}
