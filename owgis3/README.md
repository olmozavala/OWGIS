# OWGIS3

Java-free WebGIS **builder** and **static viewer**. Configure layers (XML or JSON), preview the map, and export a static site. Data still comes from ncWMS / WMS servers — the same model as OWGIS 2, without Maven or Tomcat.

Parent repo docs (OWGIS 2 Docker): [`../README.md`](../README.md).

## Requirements

- Node.js 20+
- Local ncWMS2 with sample data (typical: ExampleNcWMS on **`:8088`**)
- Optional: GeoServer on **`:8085`** for countries / coastlines / cities overlays
- Optional: OWGIS 2 on **`:8080`** if you want side-by-side parity checks

## Quick start

```bash
cd owgis3
npm install

# One command: CORS proxy (:8091) + Vite (:5173)
npm run dev:all
```

Or two terminals:

```bash
npm run proxy   # http://localhost:8091/proxy
npm run dev     # http://localhost:5173/  (proxies /proxy → :8091)
```

| URL | Purpose |
|-----|---------|
| <http://localhost:5173/> | Builder — import XML, edit site config, preview, ZIP export |
| <http://localhost:5173/viewer.html> | Viewer — uses `public/config/site.json` or a Builder session handoff |
| <http://localhost:5173/viewer.html?mobile=true> | Force mobile chrome |
| <http://localhost:5173/viewer.html?mobile=false> | Force desktop chrome |
| <http://localhost:5173/viewer.html?draft=1> | Prefer draft config from `localStorage` over `site.json` |

Mobile chrome also activates from a mobile User-Agent or viewport width ≤ 750px. Crossing that breakpoint reloads so layout stays consistent.

### Typical flow

1. Open the Builder → **Load GoM/FVCOM example** (or upload your `MenuConf` XML).
2. Keep proxy as `/proxy` for GetMetadata / GetFeatureInfo / Auto range.
3. **Build & Preview** → viewer opens with OSM + ncWMS layer.
4. Optionally **Download static ZIP** (embeds `config/site.json` + a short README).

Production static build:

```bash
npm run build
# serve dist/ on any static host; keep a CORS proxy if the WMS server lacks CORS
```

## Architecture

| Piece | Role |
|-------|------|
| Builder (`index.html`) | Import/edit XML → JSON site config; preview; ZIP export |
| Viewer (`viewer.html`) | OpenLayers map + OWGIS 2–style tools and panels |
| `scripts/proxy-server.ts` | Node CORS proxy (`/proxy?url=`) with localhost→`host.docker.internal` retry |
| `shared/config` | Types, XML↔JSON, validation, storage |
| `shared/wms` | GetMetadata / GetMap / minmax / timesteps helpers |
| `viewer/cesium3d.ts` | Lazy Cesium + olcs globe toggle |
| `viewer/streamlines/` | CoverageJSON U/V → Canvas 2D particles |

```text
Browser map tiles     →  ncWMS / WMS / GeoServer directly
Browser XHR metadata  →  /proxy → upstream (when CORS would block)
```

## Feature checklist

| Feature | Status |
|---------|--------|
| XML import / JSON site config | Done |
| Builder preview + ZIP export | Done |
| OSM / Google basemaps | Done |
| Main layer menus + fit bbox | Done |
| Optional GeoServer vector overlays + opacity | Done |
| ncWMS time (calendars + hour) | Done |
| Palettes + color range + Auto minmax | Done |
| Elevation / z-axis | Done |
| Animation play / step / transport | Done |
| GetFeatureInfo identify + time series / profile charts | Done |
| Transect draw → ncWMS GetTransect | Done |
| PNG export | Done |
| Streamlines / particles (under map overlays) | Done |
| Cesium 3D globe (lazy olcs) | Done |
| Responsive / mobile sheets | Done |
| CQL UI | Hidden for now (param plumbing remains) |
| Bing basemaps | Needs `bingMapsKey` |

## Demo stack ports

| Service | Port | Notes |
|---------|------|--------|
| OWGIS3 Vite | 5173 | This app |
| CORS proxy | 8091 | `npm run proxy` |
| ncWMS2 | 8088 | Required for GoM/FVCOM examples |
| OWGIS 2 (Docker) | 8080 | Optional parity |
| GeoServer | 8085 | Optional vector overlays (`ne:countries`, `ne:coastlines`, `ne:populated_places`) |

Example layer XML lives in `examples/` and mirrors the OWGIS 2 local ncWMS2 template. Default viewer config: `public/config/site.json`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run proxy` | CORS proxy on `:8091` |
| `npm run dev:all` | Proxy + Vite together |
| `npm run build` | `tsc` + production build → `dist/` |
| `npm run preview` | Preview the production build |

## Relation to OWGIS 2

OWGIS 2 stays at the repository root (Maven/Tomcat). OWGIS 3 does not replace the Java WAR; it reimplements the client as a static SPA with a builder. Use Docker OWGIS 2 when you need the classic Tomcat deployment or a visual reference for parity.
