# OWGIS

WebGIS for scientific maps served by WMS / [ncWMS](https://reading-escience-centre.github.io/ncwms/).

This repository contains **two generations** of the same product:

| | **OWGIS 2** (Java) | **OWGIS 3** (TypeScript) |
|---|---|---|
| Location | Repository root | [`owgis3/`](owgis3/) |
| Stack | Maven → Tomcat 9 WAR | Vite + OpenLayers + optional Cesium |
| Config | `layers/*.xml` + properties | XML/JSON site config in the Builder |
| Run | Docker Compose `:8080` | `npm run dev:all` `:5173` + proxy `:8091` |
| Docs | This file | [`owgis3/README.md`](owgis3/README.md) |

More background: [owgis.org](http://owgis.org).

---

## Choose a path

### A) OWGIS 3 — recommended for new work

Java-free builder + static viewer. Same ncWMS/WMS data model as OWGIS 2.

```bash
cd owgis3
npm install
npm run dev:all
```

- Builder: <http://localhost:5173/>
- Viewer: <http://localhost:5173/viewer.html>
- Mobile: <http://localhost:5173/viewer.html?mobile=true>

Full details: **[`owgis3/README.md`](owgis3/README.md)**.

### B) OWGIS 2 — Docker + local ncWMS2

Classic Java/Tomcat template. Use this to compare parity with OWGIS 3 or to keep an existing Tomcat deployment.

#### Prerequisites

- Docker and Docker Compose
- A running ncWMS2 with sample data (e.g. [ExampleNcWMS](https://github.com/) / local compose on `:8088`)
- Optional: GeoServer on `:8085` for vector overlays (countries / coastlines / cities)

#### 1. Start ncWMS2

```bash
cd /path/to/ExampleNcWMS
docker compose up --build -d
```

Confirm:

- UI: <http://localhost:8088/ncWMS2/>
- WMS: <http://localhost:8088/ncWMS2/wms>

For current streamlines, ncWMS datasets that provide U/V must allow downloads (`downloadable="true"`), because OWGIS requests `application/prs.coverage+json`.

#### 2. Start OWGIS 2

```bash
cd /path/to/OWGIS
docker compose up --build -d
```

Open: <http://localhost:8080/OWGIS/mapviewer>

```bash
docker compose down          # stop
docker compose up --build -d # rebuild after Java/config/layer changes
```

#### What you should see (OWGIS 2)

- Basemaps: OpenStreetMap, Google Earth, Google Roads
- Main layers: **Local ncWMS2** (GoM HYCOM + FVCOM) and **Demo** (MapServer continents)
- Optional GeoServer vectors when configured in layer XML and GeoServer is up

#### Docker networking

| Who | URL |
|-----|-----|
| Browser tiles | `http://localhost:8088/ncWMS2/wms` (`server` in layer XML) |
| Tomcat inside Docker (GetMetadata, Auto range, animations) | `http://host.docker.internal:8088/ncWMS2/wms` (`localAddress`) |

`docker-compose.yml` sets `extra_hosts: host.docker.internal:host-gateway` so the container can reach ncWMS on the host.

Optional volume mounts for live layer/config edits are commented in `docker-compose.yml`. **Do not enable them on first start** unless the WAR is already exploded under `webapps/OWGIS/` — mounting empty host dirs blocks WAR extraction (404).

---

## Repository layout

```text
Dockerfile / docker-compose.yml     OWGIS 2: Maven build → Tomcat 9
src/main/webapp/layers/             OWGIS 2 layer XML
src/main/webapp/WEB-INF/conf/       OWGIS 2 MapViewConfig.properties
owgis3/                             OWGIS 3 Vite app (builder + viewer + proxy)
  README.md                         OWGIS 3 docs
  examples/                         Sample MenuConf XML (mirrors local ncWMS2)
  public/config/site.json           Default viewer site config
```

---

## OWGIS 2 configuration tips

### Background maps

In `src/main/webapp/WEB-INF/conf/MapViewConfig.properties`:

```properties
backgroundLayer=osm
availableBackgroundLayers=osm;google;googler
availableBackgroundNames=Open Street Map;Google Earth;Google Roads
```

Bing needs a valid `bingMapsKey` before adding `bingr` / `binga` / `bingh` to the list.

### Layers

Edit XML under `src/main/webapp/layers/`, then `docker compose up --build -d`.

### Legacy Ant / NetBeans

Prefer Docker. Historical Ant/NetBeans steps remain for older trees; clone URLs and paths may differ from this Maven layout.

---

## Authors

**Olmo Zavala** — <https://github.com/olmozavala> — <https://olmozavala.com>

**Harshul Pandav** — <https://github.com/harshulpandav>

**Vladimir Mijail** — <https://github.com/mijailcc>

**Ixchel Zazueta** — <https://github.com/ixchelzg>

**Pablo Camacho** — <https://github.com/Pablocg0>

## License

MIT — see `license.txt`.
