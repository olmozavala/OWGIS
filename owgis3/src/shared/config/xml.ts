import type { BBox, LayerConfig, LocaleLabels, MenuEntry, SiteConfig } from "./types";
import { defaultSiteSettings, emptySiteConfig } from "./types";

/**
 * Parse a comma-separated bbox string into a numeric tuple.
 *
 * @param raw attribute value like "-180,-90,180,90"
 * @param fallback default bbox when parsing fails
 * @returns west,south,east,north
 */
function parseBBox(raw: string | null, fallback: BBox): BBox {
  if (!raw) {
    return fallback;
  }
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return fallback;
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

/**
 * Collect locale label attributes (EN, ES, …) from an element.
 *
 * @param el XML element
 * @returns locale map
 */
function readLabels(el: Element): LocaleLabels {
  const labels: LocaleLabels = {};
  for (const attr of Array.from(el.attributes)) {
    if (/^[A-Z]{2}(_[A-Z]{2})?$/.test(attr.name) || attr.name === "HI_IN") {
      labels[attr.name] = attr.value;
    }
  }
  return labels;
}

/**
 * Merge parent MainLayers group attributes with a child layer element.
 *
 * @param group MainLayers / OptionalLayers element
 * @param layerEl child layer element
 * @param kind layer kind
 * @param index unique index for id generation
 * @returns layer config
 */
function layerFromElements(
  group: Element,
  layerEl: Element,
  kind: "main" | "optional" | "background",
  index: number,
): LayerConfig {
  const get = (name: string): string | null =>
    layerEl.getAttribute(name) ?? group.getAttribute(name);

  const name = layerEl.getAttribute("name") ?? `layer-${index}`;
  const menuRaw = layerEl.getAttribute("Menu") ?? "";
  const labels = readLabels(layerEl);
  if (!labels.EN) {
    labels.EN = name;
  }

  const style = get("style") ?? "default-scalar";
  const palette = get("palette") ?? "default";
  const ncWmsTwo = (get("ncWMStwo") ?? get("ncwmstwo") ?? "false").toLowerCase() === "true";
  const ncWms = ncWmsTwo || (get("ncWMS") ?? "false").toLowerCase() === "true";

  const speedRaw = layerEl.getAttribute("defParticleSpeed");
  const minColorRaw = get("mincolor");
  const maxColorRaw = get("maxcolor");

  return {
    id: `${kind}-${index}-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    name,
    server: get("server") ?? "",
    localAddress: get("localAddress") ?? undefined,
    kind,
    menuPath: menuRaw ? menuRaw.split(",").map((s) => s.trim()).filter(Boolean) : [],
    labels,
    format: get("format") ?? "image/png",
    bbox: parseBBox(get("BBOX"), [-180, -90, 180, 90]),
    projection: get("proj") ?? get("projection") ?? "EPSG:4326",
    style,
    palette,
    ncWms,
    ncWmsTwo,
    selected: (layerEl.getAttribute("selected") ?? "false").toLowerCase() === "true",
    featureInfo: layerEl.getAttribute("featureInfo") ?? undefined,
    cql: layerEl.getAttribute("CQL") ?? undefined,
    cqlCols: layerEl.getAttribute("cqlcols") ?? undefined,
    overlayStreamlines: layerEl.getAttribute("overlaystreamlines") ?? undefined,
    defParticleSpeed: speedRaw ? Number(speedRaw) : undefined,
    maxTimeRange: layerEl.getAttribute("max_time_range") ?? undefined,
    minColor: minColorRaw ? Number(minColorRaw) : undefined,
    maxColor: maxColorRaw ? Number(maxColorRaw) : undefined,
    tiled: (get("tiled") ?? "false").toLowerCase() === "true",
  };
}

/**
 * Parse OWGIS layer XML (`MenuConf`) into a SiteConfig.
 *
 * @param xmlText raw XML string
 * @returns site configuration
 * @throws Error when XML is invalid or not a MenuConf document
 */
export function parseLayerXml(xmlText: string): SiteConfig {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(`Invalid XML: ${parseError.textContent ?? "parse error"}`);
  }

  const root = doc.documentElement;
  if (!root || root.tagName !== "MenuConf") {
    throw new Error("Root element must be MenuConf");
  }

  const site = emptySiteConfig();
  site.settings = defaultSiteSettings();

  const menusEl = root.querySelector("Menus");
  if (menusEl) {
    const menus: MenuEntry[] = [];
    menusEl.querySelectorAll(":scope > Menu").forEach((menuEl) => {
      const id = menuEl.getAttribute("ID");
      if (!id) {
        return;
      }
      menus.push({ id, labels: readLabels(menuEl) });
    });
    site.menus = menus;
  }

  let index = 0;
  root.querySelectorAll(":scope > MainLayers").forEach((group) => {
    group.querySelectorAll(":scope > layer").forEach((layerEl) => {
      site.layers.push(layerFromElements(group, layerEl, "main", index++));
    });
  });
  root.querySelectorAll(":scope > OptionalLayers").forEach((group) => {
    group.querySelectorAll(":scope > layer").forEach((layerEl) => {
      site.layers.push(layerFromElements(group, layerEl, "optional", index++));
    });
  });
  root.querySelectorAll(":scope > BackgroundLayers").forEach((group) => {
    group.querySelectorAll(":scope > layer").forEach((layerEl) => {
      site.layers.push(layerFromElements(group, layerEl, "background", index++));
    });
  });

  if (!site.layers.some((l) => l.selected && l.kind === "main")) {
    const firstMain = site.layers.find((l) => l.kind === "main");
    if (firstMain) {
      firstMain.selected = true;
    }
  }

  return site;
}

/**
 * Serialize a SiteConfig back to OWGIS-compatible MenuConf XML.
 *
 * @param site site configuration
 * @returns XML string
 */
export function siteConfigToXml(site: SiteConfig): string {
  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  const labelAttrs = (labels: LocaleLabels): string =>
    Object.entries(labels)
      .map(([k, v]) => `${k}="${esc(v)}"`)
      .join(" ");

  const menusXml = site.menus
    .map((m) => `    <Menu ID="${esc(m.id)}" ${labelAttrs(m.labels)}/>`)
    .join("\n");

  const mains = site.layers.filter((l) => l.kind === "main");
  // Group by server+bbox for compact XML
  const groups = new Map<string, LayerConfig[]>();
  for (const layer of mains) {
    const key = `${layer.server}|${layer.bbox.join(",")}|${layer.ncWmsTwo}`;
    const list = groups.get(key) ?? [];
    list.push(layer);
    groups.set(key, list);
  }

  let mainXml = "";
  for (const layers of groups.values()) {
    const g = layers[0];
    mainXml += `  <MainLayers BBOX="${g.bbox.join(",")}" format="${esc(g.format)}" server="${esc(g.server)}"`;
    if (g.localAddress) {
      mainXml += ` localAddress="${esc(g.localAddress)}"`;
    }
    if (g.ncWmsTwo) {
      mainXml += ` ncWMStwo="true"`;
    }
    mainXml += ` style="${esc(g.style)}" palette="${esc(g.palette)}">\n`;
    for (const layer of layers) {
      mainXml += `    <layer Menu="${esc(layer.menuPath.join(","))}" ${labelAttrs(layer.labels)} name="${esc(layer.name)}"`;
      if (layer.palette !== g.palette) {
        mainXml += ` palette="${esc(layer.palette)}"`;
      }
      if (layer.selected) {
        mainXml += ` selected="true"`;
      }
      if (layer.overlayStreamlines) {
        mainXml += ` overlaystreamlines="${esc(layer.overlayStreamlines)}"`;
      }
      if (layer.defParticleSpeed !== undefined) {
        mainXml += ` defParticleSpeed="${layer.defParticleSpeed}"`;
      }
      mainXml += `/>\n`;
    }
    mainXml += `  </MainLayers>\n`;
  }

  const optionals = site.layers.filter((l) => l.kind === "optional");
  let optionalXml = "";
  if (optionals.length) {
    const optGroups = new Map<string, LayerConfig[]>();
    for (const layer of optionals) {
      const key = `${layer.server}|${layer.bbox.join(",")}`;
      const list = optGroups.get(key) ?? [];
      list.push(layer);
      optGroups.set(key, list);
    }
    for (const layers of optGroups.values()) {
      const g = layers[0];
      optionalXml += `  <OptionalLayers BBOX="${g.bbox.join(",")}" format="${esc(g.format)}" server="${esc(g.server)}" vectorLayer="true" proj="${esc(g.projection)}">\n`;
      for (const layer of layers) {
        optionalXml += `    <layer Menu="${esc(layer.menuPath.join(","))}" ${labelAttrs(layer.labels)} name="${esc(layer.name)}"`;
        if (layer.style) {
          optionalXml += ` style="${esc(layer.style)}"`;
        }
        if (layer.selected) {
          optionalXml += ` selected="true"`;
        }
        optionalXml += `/>\n`;
      }
      optionalXml += `  </OptionalLayers>\n`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<MenuConf>
  <Menus>
${menusXml}
  </Menus>
${mainXml}${optionalXml}</MenuConf>
`;
}

/**
 * Validate a site config and return human-readable issues.
 *
 * @param site site configuration
 * @returns list of validation messages (empty if ok)
 */
export function validateSiteConfig(site: SiteConfig): string[] {
  const issues: string[] = [];
  if (site.layers.length === 0) {
    issues.push("No layers defined.");
  }
  const mains = site.layers.filter((l) => l.kind === "main");
  if (mains.length === 0) {
    issues.push("No main layers defined.");
  }
  if (!mains.some((l) => l.selected)) {
    issues.push("No main layer is marked selected.");
  }
  for (const layer of site.layers) {
    if (!layer.name) {
      issues.push(`Layer ${layer.id} is missing a WMS name.`);
    }
    if (!layer.server) {
      issues.push(`Layer ${layer.name || layer.id} is missing a server URL.`);
    }
  }
  return issues;
}

/**
 * Return the currently selected main layer, if any.
 *
 * @param site site configuration
 * @returns selected main layer or undefined
 */
export function getSelectedMainLayer(site: SiteConfig): LayerConfig | undefined {
  return site.layers.find((l) => l.kind === "main" && l.selected)
    ?? site.layers.find((l) => l.kind === "main");
}
