import exampleXmlUrl from "../examples/0_Local_ncWMS2.xml?raw";
import type { SiteConfig } from "../shared/config/types";
import { emptySiteConfig } from "../shared/config/types";
import {
  parseLayerXml,
  siteConfigToXml,
  validateSiteConfig,
  getSelectedMainLayer,
} from "../shared/config/xml";
import {
  downloadJson,
  downloadText,
  loadSiteDraft,
  saveSiteDraft,
  saveSiteToSession,
} from "../shared/config/storage";
import { exportStaticZip } from "./exportZip";

/**
 * OWGIS3 Builder: import/edit layer XML, validate, preview viewer, export ZIP.
 */
function renderBuilder(root: HTMLElement): void {
  let site: SiteConfig = loadSiteDraft() ?? emptySiteConfig();
  let xmlText = "";

  root.innerHTML = `
    <section class="panel">
      <h2>1. Layer configuration</h2>
      <div class="row">
        <button type="button" id="btn-load-example" class="primary">Load GoM/FVCOM example</button>
        <label class="button">Upload XML<input type="file" id="file-xml" accept=".xml,text/xml" hidden /></label>
        <button type="button" id="btn-parse">Parse XML</button>
        <button type="button" id="btn-to-xml">Export XML</button>
        <button type="button" id="btn-to-json">Export JSON</button>
      </div>
      <textarea id="xml-editor" spellcheck="false" placeholder="Paste MenuConf XML here…"></textarea>
      <p class="status" id="parse-status"></p>
    </section>
    <section class="panel">
      <h2>2. Site settings &amp; layers</h2>
      <div class="row">
        <label>Proxy base
          <input id="proxy-base" value="/proxy" />
        </label>
        <label>Background
          <select id="bg-layer">
            <option value="osm">Open Street Map</option>
            <option value="google">Google Earth</option>
            <option value="googler">Google Roads</option>
          </select>
        </label>
        <label>Language
          <select id="lang">
            <option value="EN">EN</option>
            <option value="ES">ES</option>
          </select>
        </label>
      </div>
      <ul class="layer-list" id="layer-list"></ul>
      <div class="row" style="margin-top:1rem">
        <button type="button" id="btn-save-draft">Save draft</button>
        <button type="button" id="btn-preview" class="primary">Build &amp; Preview</button>
        <button type="button" id="btn-zip">Download static ZIP</button>
      </div>
      <p class="status" id="build-status"></p>
    </section>
  `;

  const xmlEditor = root.querySelector("#xml-editor") as HTMLTextAreaElement;
  const parseStatus = root.querySelector("#parse-status") as HTMLElement;
  const buildStatus = root.querySelector("#build-status") as HTMLElement;
  const layerList = root.querySelector("#layer-list") as HTMLUListElement;
  const proxyInput = root.querySelector("#proxy-base") as HTMLInputElement;
  const bgSelect = root.querySelector("#bg-layer") as HTMLSelectElement;
  const langSelect = root.querySelector("#lang") as HTMLSelectElement;

  /**
   * Refresh the layer list UI from current site config.
   */
  function refreshLayerList(): void {
    const lang = langSelect.value;
    layerList.innerHTML = site.layers
      .map((layer) => {
        const title = layer.labels[lang] ?? layer.labels.EN ?? layer.name;
        const selected = layer.selected ? " • selected" : "";
        return `<li data-id="${layer.id}">
          <div>
            <strong>${title}</strong>
            <div class="meta">${layer.kind} · ${layer.name} · ${layer.server}${selected}</div>
          </div>
          <button type="button" data-select="${layer.id}">Select</button>
        </li>`;
      })
      .join("");
  }

  /**
   * Apply settings inputs onto the site config object.
   */
  function applySettings(): void {
    site.settings.proxyBase = proxyInput.value.trim();
    site.settings.backgroundLayer = bgSelect.value;
    site.settings.defaultLanguage = langSelect.value;
  }

  /**
   * Parse XML text into site config and update UI.
   *
   * @param text XML string
   */
  function applyXml(text: string): void {
    try {
      site = parseLayerXml(text);
      xmlText = text;
      applySettingsFromSite();
      refreshLayerList();
      const issues = validateSiteConfig(site);
      parseStatus.className = issues.length ? "status error" : "status ok";
      parseStatus.textContent = issues.length
        ? issues.join("\n")
        : `Loaded ${site.layers.length} layers, ${site.menus.length} menus.`;
    } catch (error) {
      parseStatus.className = "status error";
      parseStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Sync settings controls from site.
   */
  function applySettingsFromSite(): void {
    proxyInput.value = site.settings.proxyBase || "/proxy";
    bgSelect.value = site.settings.backgroundLayer || "osm";
    langSelect.value = site.settings.defaultLanguage || "EN";
  }

  if (site.layers.length) {
    xmlText = siteConfigToXml(site);
    xmlEditor.value = xmlText;
    applySettingsFromSite();
    refreshLayerList();
    parseStatus.className = "status ok";
    parseStatus.textContent = `Restored draft (${site.layers.length} layers).`;
  }

  root.querySelector("#btn-load-example")?.addEventListener("click", () => {
    xmlEditor.value = exampleXmlUrl;
    applyXml(exampleXmlUrl);
  });

  root.querySelector("#file-xml")?.addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    xmlEditor.value = text;
    applyXml(text);
  });

  root.querySelector("#btn-parse")?.addEventListener("click", () => {
    applyXml(xmlEditor.value);
  });

  root.querySelector("#btn-to-xml")?.addEventListener("click", () => {
    applySettings();
    downloadText("layers.xml", siteConfigToXml(site));
  });

  root.querySelector("#btn-to-json")?.addEventListener("click", () => {
    applySettings();
    downloadJson("site.json", site);
  });

  layerList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const id = target.getAttribute("data-select");
    if (!id) {
      return;
    }
    site.layers.forEach((layer) => {
      if (layer.kind === "main") {
        layer.selected = layer.id === id;
      }
    });
    refreshLayerList();
  });

  root.querySelector("#btn-save-draft")?.addEventListener("click", () => {
    applySettings();
    saveSiteDraft(site);
    buildStatus.className = "status ok";
    buildStatus.textContent = "Draft saved in this browser.";
  });

  root.querySelector("#btn-preview")?.addEventListener("click", () => {
    applySettings();
    const issues = validateSiteConfig(site);
    if (issues.length) {
      buildStatus.className = "status error";
      buildStatus.textContent = issues.join("\n");
      return;
    }
    saveSiteToSession(site);
    saveSiteDraft(site);
    const main = getSelectedMainLayer(site);
    buildStatus.className = "status ok";
    buildStatus.textContent = `Opening viewer for ${main?.name ?? "layer"}…`;
    window.location.href = "./viewer.html";
  });

  root.querySelector("#btn-zip")?.addEventListener("click", async () => {
    applySettings();
    const issues = validateSiteConfig(site);
    if (issues.length) {
      buildStatus.className = "status error";
      buildStatus.textContent = issues.join("\n");
      return;
    }
    buildStatus.className = "status";
    buildStatus.textContent = "Building ZIP…";
    try {
      await exportStaticZip(site);
      buildStatus.className = "status ok";
      buildStatus.textContent = "Static site ZIP downloaded.";
    } catch (error) {
      buildStatus.className = "status error";
      buildStatus.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}

const app = document.querySelector<HTMLElement>("#app");
if (app) {
  renderBuilder(app);
}
