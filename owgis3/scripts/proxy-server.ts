/**
 * Optional CORS proxy for WMS/ncWMS metadata, GetMap, and GetFeatureInfo.
 * Mirrors OWGIS 2 SimpleAjaxRedirectServlet for Docker/local setups.
 *
 * Run: npm run proxy  → http://localhost:8091/proxy?url=...
 */
import express from "express";
import cors from "cors";

const PORT = Number(process.env.OWGIS_PROXY_PORT ?? 8091);
const READ_MS = 60000;

/**
 * Rewrite loopback hosts so a containerized proxy can reach host services.
 *
 * @param url absolute URL
 * @returns rewritten URL
 */
function rewriteLoopback(url: string): string {
  return url
    .replace("://localhost:", "://host.docker.internal:")
    .replace("://127.0.0.1:", "://host.docker.internal:");
}

/**
 * Fetch a remote URL with timeout; retry via host.docker.internal on failure.
 *
 * @param url absolute URL
 * @returns status, body bytes, and content type
 */
async function fetchRemote(
  url: string,
): Promise<{ status: number; body: Buffer; contentType: string }> {
  const attempt = async (
    target: string,
  ): Promise<{ status: number; body: Buffer; contentType: string }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), READ_MS);
    try {
      const response = await fetch(target, {
        signal: controller.signal,
        headers: { Accept: "*/*" },
      });
      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      const body = Buffer.from(await response.arrayBuffer());
      return { status: response.status, body, contentType };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt(url);
  } catch (firstError) {
    const rewritten = rewriteLoopback(url);
    if (rewritten === url) {
      throw firstError;
    }
    console.warn(`Proxy retry via ${rewritten}`);
    return attempt(rewritten);
  }
}

const app = express();
app.use(cors());

app.get("/proxy", async (req, res) => {
  const url = String(req.query.url ?? "");
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).send("Missing or invalid url parameter");
    return;
  }
  try {
    const result = await fetchRemote(url);
    res.status(result.status);
    // Strip any charset that would corrupt binary image payloads.
    const contentType = result.contentType.split(";")[0].trim() || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.send(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Proxy failed:", message);
    res.status(502).send(`Failed to call: ${url}\n${message}`);
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, readMs: READ_MS });
});

app.listen(PORT, () => {
  console.log(`OWGIS3 CORS proxy listening on http://localhost:${PORT}/proxy`);
});
