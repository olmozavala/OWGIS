OWGIS 2
=====

For more info please visit [owgis.org](http://owgis.org)!

# What is OWGIS?

OWGIS is a Java web application that creates WebGIS sites by automatically writing HTML and JavaScript code.

We built OWGIS because we wanted an easy way to publish scientific maps on the web. OWGIS provides self-contained WebGIS sites that can be easily customized. OWGIS can publish any type of georeferenced data served by a WMS server like [Geoserver](http://geoserver.org) or [ncWMS](https://reading-escience-centre.github.io/ncwms/). The latter uses an extension of the WMS standard to serve 3D or 4D data stored as [NetCDF](http://www.unidata.ucar.edu/software/netcdf/) files.

Each WebGIS site is configured by:

- Java properties: `src/main/webapp/WEB-INF/conf/MapViewConfig.properties`
- Layer XML files: `src/main/webapp/layers/*.xml`

For detailed configuration docs see the tutorials at [owgis.org](http://owgis.org).

# Quick start (Docker + local ncWMS2)

This is the recommended way to run this template locally.

## Prerequisites

- Docker and Docker Compose
- A running ncWMS2 instance with sample data (ExampleNcWMS)

## 1. Start local ncWMS2

From the ExampleNcWMS project (adjust the path if yours differs):

```bash
cd /path/to/ExampleNcWMS
docker compose up --build -d
```

Confirm:

- Godiva / ncWMS UI: <http://localhost:8088/ncWMS2/>
- WMS endpoint: <http://localhost:8088/ncWMS2/wms>

For streamlines/currents in OWGIS, datasets that provide vector components must allow downloads in ncWMS config (`downloadable="true"`), because OWGIS requests `application/prs.coverage+json`.

## 2. Start OWGIS

```bash
cd /path/to/OWGIS
docker compose up --build -d
```

Open: <http://localhost:8080/OWGIS/mapviewer>

Stop:

```bash
docker compose down
```

Rebuild after Java/config/layer changes:

```bash
docker compose up --build -d
```

## What you should see

- Default background: OpenStreetMap (Google Earth / Google Roads also available)
- Default main layer: **GoM Water Temperature** from local ncWMS2
- Layer menus: **Local ncWMS2** (FVCOM + GoM HYCOM) and **Demo** (public MapServer continents as a normal layer)

## Architecture notes (Docker)

| Who | URL used |
|-----|----------|
| Browser tile / map requests | `http://localhost:8088/ncWMS2/wms` (`server` in layer XML) |
| Tomcat inside Docker (GetMetadata, Auto range proxy, animations) | `http://host.docker.internal:8088/ncWMS2/wms` (`localAddress` + redirect rewrite) |

`docker-compose.yml` adds `extra_hosts: host.docker.internal:host-gateway` so the OWGIS container can reach ncWMS on the host.

# Project layout (relevant bits)

```text
Dockerfile / docker-compose.yml     Maven build → Tomcat 9 WAR
src/main/webapp/layers/
  0_Local_ncWMS2.xml                Local ncWMS2 demo layers
  1_Demo_MapServer.xml              Public MapServer sample (main layer, not basemap)
  0_Background_Layer.xml            Optional WMS basemap config (not shown in picker by default)
src/main/webapp/layers_archive/     Original UNAM / live-demo layer XMLs
src/main/webapp/WEB-INF/conf/
  MapViewConfig.properties          Zoom, backgrounds, language, etc.
```

# Fixes included in this revive

These changes make the Maven/Tomcat 9 + local ncWMS2 stack usable again:

1. **Docker packaging** – multi-stage Maven build, Tomcat 9, Java 8 compile target, `javax.servlet-api` provided.
2. **Dead remote servers** – old UNAM layer XMLs moved to `layers_archive/`; active layers point at local ncWMS2 + public MapServer demo.
3. **ncWMS hang protection** – HTTP connect/read timeouts in `NetCDFRequestManager`.
4. **Numeric parsing** – `Layer.setLayerDetails` accepts Double/Integer scale values safely.
5. **Layer indexing** – first main-layer index is `1` for OSM/Google backgrounds (not WMS-only).
6. **Animations** – `getAnimTimes` resolves exact ncWMS axis timestamps; JS keeps full day ranges and expands hourly frames; missing `break`s in AJAX switch fixed; next/prev frame guards when images are not loaded.
7. **Auto color range** – `simpleAjaxRedirect` retries `localhost` via `host.docker.internal`; safer JSON parsing (no `eval`).
8. **Background picker** – WMS removed from basemap dropdown (MapServer continents stays as a Demo main layer). Bing options omitted until a valid `bingMapsKey` is set.
9. **UI polish** – empty optional menu no longer throws; stop-animation text visibility fixed earlier in the revive.

# Configuration tips

### Background maps

In `MapViewConfig.properties`:

```properties
backgroundLayer=osm
availableBackgroundLayers=osm;google;googler
availableBackgroundNames=Open Street Map;Google Earth;Google Roads
```

To re-enable Bing after obtaining a key:

```properties
bingMapsKey=YOUR_KEY_HERE
availableBackgroundLayers=osm;google;googler;bingr;binga;bingh
```

### Layers

Edit XML under `src/main/webapp/layers/`, then rebuild the container. For live XML tweaks without rebuild, uncomment the volume mounts in `docker-compose.yml`.

### Optional: Ant / Netbeans

Legacy Ant and Netbeans workflows remain below for historical setups. Prefer Docker for this repository.

## Ant

Step 1. Clone the repository:

```bash
git clone https://github.com/olmozavala/OWGIS_V2.git OWGISV2Template
```

Step 2. Edit `buildTemplate.xml` to match your paths, mainly the Tomcat folder.

Step 3. Build your war file:

```bash
ant -f buildTemplate.xml dist
```

Step 4. Deploy:

```bash
cp OWGISV2Template.war /usr/local/tomcat/webapps
```

Test at <http://localhost:8080/OWGISV2Template/mapviewer>

## Netbeans

Step 1. Clone the repository:

```bash
git clone https://github.com/olmozavala/OWGIS_V2.git OWGISV2Template
```

Step 2. Create new project in Netbeans

- Delete `buildTemplate.xml`
- File → New Project → Java Web → Web Application with Existing Sources
- Point Location at the project root
- Select Tomcat (or similar)
- Web Pages → `web`, WEB-INF → `web/WEB-INF`, Sources → `src/java` (adjust if using the Maven `src/main/...` layout)

Step 3. Project Properties → Run → Relative URL → `/mapviewer`

## Mobile interface

The mobile UI is selected from the User-Agent (or `?mobile=true`). For the older Titanium Android wrapper see [OWGIS_Mob](https://github.com/harshulpandav/OWGIS_Mob).

# Authors

**Olmo Zavala** — <https://github.com/olmozavala> — <https://olmozavala.com>

**Harshul Pandav** — <https://github.com/harshulpandav>

**Vladimir Mijail** — <https://github.com/mijailcc>

**Ixchel Zazueta** — <https://github.com/ixchelzg>

**Pablo Camacho** — <https://github.com/Pablocg0>

# License

OWGIS is licensed under the MIT Open Source license. See `license.txt` in this repository.
