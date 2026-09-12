// Local preview server: renders release and story packs on demand and saves the
// choices back into .shipseal. Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).

import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { loadBrand } from "../brand/load.js";
import { loadConfig } from "../config/load.js";
import { cleanLine, firstSentence } from "../copy/deterministic.js";
import { ShipsealError, formatError } from "../core/errors.js";
import { createTakumiRenderer, resolvePackageRoot } from "../render/takumi.js";
import type { StudioOutput, StudioState } from "../studio/client.js";
import { buildStudioPack, selectedBrand, selectedConfig, selectionSchema } from "../studio/pack.js";
import { collectFacts } from "../sources/collect.js";
import { gitCurrentTag } from "../sources/git.js";
import { loadLogos, readShipsealVersion } from "./shared.js";
import { loadStoryImages } from "./story.js";

/** Localhost only, so the page is served inline rather than from a template file. */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Shipseal preview</title>
</head><body style="margin:0;background:#0c0c0f"><main id="studio"></main><script type="module">
import { mountStudio } from '/studio-client.js';
const token = new URL(location.href).searchParams.get('token');
async function api(path, value) {
  const response = await fetch(path, {
    method: value === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shipseal-Token': token },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error);
  return body;
}
mountStudio(document.getElementById('studio'), {
  mode: 'local',
  load: () => api('/api/state'),
  render: (value) => api('/api/render', value),
  save: (value) => api('/api/save', value),
});
</script></body></html>`;

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'",
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readSelection(request: IncomingMessage) {
  let text = "";
  for await (const value of request) {
    if (!Buffer.isBuffer(value)) {
      throw new ShipsealError(
        "preview.body",
        "The request body is not valid bytes.",
        "Reload the preview.",
      );
    }
    text += value.toString("utf8");
    if (text.length > 16_384) {
      throw new ShipsealError(
        "preview.body-size",
        "The preview request is too large.",
        "Shorten the headline or upgrade instructions.",
      );
    }
  }
  try {
    const raw: unknown = JSON.parse(text);
    return selectionSchema.parse(raw);
  } catch (error) {
    throw new ShipsealError(
      "preview.selection",
      "The preview options are invalid.",
      "Reload the preview and choose supported options.",
      { cause: error },
    );
  }
}

/** Write through a temporary file so an interrupted save never truncates the original. */
async function writeAtomic(destination: string, value: unknown): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

export async function startPreview(options: {
  cwd: string;
  tag?: string;
  port?: number;
  package?: string;
}) {
  const resolvedTag = options.tag ?? (await gitCurrentTag(options.cwd));
  if (resolvedTag === undefined) {
    throw new ShipsealError(
      "preview.no-tag",
      "No release tag was found.",
      "Pass --tag with an existing release tag.",
    );
  }
  // Declared as string so the request handler below reads it without renarrowing.
  const tag: string = resolvedTag;
  // Startup validates the workspace before printing a URL the user is told to open.
  await loadBrand(options.cwd);
  const token = randomUUID();
  let origin = "";

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.host !== new URL(origin).host) {
      json(response, 403, {
        error: "Invalid preview host. Open the localhost URL printed by Shipseal.",
      });
      return;
    }
    const url = new URL(request.url ?? "/", origin);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, PAGE_HEADERS);
      response.end(PAGE);
      return;
    }
    if (request.method === "GET" && url.pathname === "/studio-client.js") {
      const script = await readFile(join(resolvePackageRoot(), "dist", "studio-client.js"));
      response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      response.end(script);
      return;
    }
    if (
      request.headers["x-shipseal-token"] !== token ||
      (request.method === "POST" && request.headers.origin !== origin)
    ) {
      json(response, 403, {
        error:
          "This preview request is not authorized. Reload the localhost URL printed by Shipseal.",
      });
      return;
    }

    const brand = await loadBrand(options.cwd);
    const config = await loadConfig(options.cwd);
    const collect: Parameters<typeof collectFacts>[0] = {
      cwd: options.cwd,
      event: { kind: "release", tag },
      skipNetwork: true,
    };
    if (options.package !== undefined) {
      collect.packagePath = options.package;
    }
    if (config.release?.changelogPath !== undefined) {
      collect.changelogPath = config.release.changelogPath;
    }
    if (config.release?.snippet !== undefined) {
      collect.snippet = config.release.snippet;
    }

    if (request.method === "GET" && url.pathname === "/api/state") {
      const facts = await collectFacts(collect);
      const state: StudioState = {
        name: brand.name,
        style: brand.style,
        theme: brand.theme,
        accent: brand.colors.primary ?? "#ff4d4d",
        headline: config.release?.headline ?? "",
        upgrade: config.release?.story?.upgrade ?? "",
        headlines: [...(facts.release?.breaking ?? []), ...(facts.release?.features ?? [])].map(
          (item) => cleanLine(firstSentence(item.value)),
        ),
        notes: [
          "Local facts come from your checkout. Change files and refresh this page to reload them. Screenshots use release.story.before and release.story.after in config.json.",
        ],
        releases: [{ tag, label: tag }],
        tag,
      };
      json(response, 200, state);
      return;
    }
    if (request.method !== "POST") {
      json(response, 404, { error: "Preview route not found." });
      return;
    }

    const selection = await readSelection(request);
    if (url.pathname === "/api/save") {
      const nextConfig = selectedConfig(config, selection);
      // Pack-specific sizes are preview choices, so ordinary release formats are preserved.
      nextConfig.formats = config.formats;
      await Promise.all([
        writeAtomic(join(options.cwd, ".shipseal", "brand.json"), selectedBrand(brand, selection)),
        writeAtomic(join(options.cwd, ".shipseal", "config.json"), nextConfig),
      ]);
      json(response, 200, { saved: true });
      return;
    }
    if (url.pathname !== "/api/render") {
      json(response, 404, { error: "Preview route not found." });
      return;
    }

    const facts = await collectFacts(collect);
    const packInput: Parameters<typeof buildStudioPack>[0] = {
      facts,
      brand,
      config,
      selection,
      renderer: await createTakumiRenderer(),
      generatedAt: new Date().toISOString(),
      version: readShipsealVersion(),
      images: await loadStoryImages(options.cwd, config),
    };
    const logos = await loadLogos(options.cwd, brand);
    if (logos !== undefined) {
      packInput.logos = logos;
    }
    const pack = await buildStudioPack(packInput);
    const output: StudioOutput = {
      files: pack.result.files.map((file) => ({
        name: file.fileName,
        data: Buffer.from(file.bytes).toString("base64"),
        width: file.width,
        height: file.height,
      })),
      archive: Buffer.from(pack.archive).toString("base64"),
      manifest: pack.manifest,
    };
    const pdf = pack.downloads.find((file) => file.name === "story.pdf");
    if (pdf !== undefined) {
      output.pdf = Buffer.from(pdf.bytes).toString("base64");
    }
    json(response, 200, output);
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      json(response, 400, {
        error:
          error instanceof ShipsealError
            ? formatError(error)
            : `${error instanceof Error ? error.message : "Preview failed"}. Check the files and retry.`,
      });
    });
  });
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4175, "127.0.0.1", () => {
      server.removeListener("error", reject);
      accept();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new ShipsealError(
      "preview.listen",
      "The preview server could not start.",
      "Choose another --port and retry.",
    );
  }
  origin = `http://127.0.0.1:${String(address.port)}`;
  return { server, url: `${origin}/?token=${token}`, token };
}

export async function runPreview(options: Parameters<typeof startPreview>[0]): Promise<void> {
  let preview: Awaited<ReturnType<typeof startPreview>>;
  try {
    preview = await startPreview(options);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") {
      throw new ShipsealError(
        "preview.port",
        "The preview port is already in use.",
        "Pass --port with another available port.",
        { cause: error },
      );
    }
    throw error;
  }
  process.stdout.write(`Preview: ${preview.url}\nPress Ctrl+C to stop.\n`);
  await new Promise<void>((accept) => {
    const stop = () => {
      preview.server.close();
      preview.server.closeAllConnections();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    preview.server.once("close", () => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      accept();
    });
  });
}
