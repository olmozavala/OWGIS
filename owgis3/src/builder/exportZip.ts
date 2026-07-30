import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { SiteConfig } from "../shared/config/types";

/**
 * Build a downloadable static ZIP with site.json and a minimal viewer shell.
 * For full hashed assets, run `npm run build` and host the `dist/` folder;
 * this ZIP is a self-contained config + pointer README for static hosting.
 *
 * @param site site configuration to embed
 */
export async function exportStaticZip(site: SiteConfig): Promise<void> {
  const zip = new JSZip();
  const config = { ...site, version: 3 };
  zip.file("config/site.json", JSON.stringify(config, null, 2));

  zip.file(
    "README.txt",
    `OWGIS3 static export
====================

1. Prefer publishing the output of \`npm run build\` (dist/) for the full app.
2. This ZIP includes config/site.json for the selected layers.
3. Place config/site.json next to your hosted viewer and open viewer.html?config=config/site.json
4. If ncWMS blocks CORS, run the proxy: npm run proxy
   and set settings.proxyBase to http://localhost:8091/proxy (or your hosted proxy).

Selected background: ${site.settings.backgroundLayer}
Layers: ${site.layers.length}
`,
  );

  // Lightweight standalone viewer page that loads config from relative path.
  zip.file(
    "index.html",
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=./viewer.html?config=config/site.json" />
  <title>OWGIS3</title>
</head>
<body>
  <p>Redirecting to viewer… <a href="./viewer.html?config=config/site.json">Open viewer</a></p>
</body>
</html>
`,
  );

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, "owgis3-site.zip");
}
