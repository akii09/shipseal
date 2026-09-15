import { mountStudio, type StudioBackend, type StudioOutput } from "../../../../packages/shipseal/src/studio/client";
import { collectPublicRelease, defaultRelease, listPublicReleases, type PublicRelease } from "../../../../packages/shipseal/src/sources/public-repo";
import { buildStudioPack, selectionSchema } from "../../../../packages/shipseal/src/studio/pack";
import { createBrowserTakumiRenderer } from "../../../../packages/shipseal/src/render/takumi";
import { DEFAULT_CONFIG } from "../../../../packages/shipseal/src/config/schema";
import { cleanLine, firstSentence } from "../../../../packages/shipseal/src/copy/deterministic";
import { ShipsealError, formatError } from "../../../../packages/shipseal/src/core/errors";
import packageJson from "../../../../packages/shipseal/package.json";
import monoUrl from "../../../../packages/shipseal/assets/fonts/GeistMono[wght].ttf?url";

function base64(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value);
}

export function startDemo(root: HTMLElement): void {
  let releases: PublicRelease[] = [];
  let repository = "";
  let current: Awaited<ReturnType<typeof collectPublicRelease>> | undefined;
  let renderer: ReturnType<typeof createBrowserTakumiRenderer> | undefined;
  // Serialize WASM renders: changes made during a render are queued by the UI.
  let rendering: Promise<unknown> = Promise.resolve();
  const backend: StudioBackend = {
    mode: "public",
    async load(repo, tag) {
      try {
        if (repo !== repository || releases.length === 0) { releases = await listPublicReleases(repo); repository = repo; }
        const release = releases.find((item) => item.tag_name === tag) ?? defaultRelease(releases);
        if (release === undefined) throw new Error("No release is selected.");
        current = await collectPublicRelease(repo, release);
        const { brand, facts, notes } = current;
        return { name: brand.name, style: brand.style, theme: brand.theme, accent: brand.colors.primary ?? "#fb4c4b", headline: "", upgrade: "",
          headlines: [...(facts.release?.breaking ?? []), ...(facts.release?.features ?? [])].map((item) => cleanLine(firstSentence(item.value))), notes,
          releases: releases.map((item) => ({ tag: item.tag_name, label: `${item.tag_name}${item.prerelease ? " (prerelease)" : ""}` })), tag: release.tag_name };
      } catch (error) {
        throw new Error(
          error instanceof ShipsealError
            ? formatError(error)
            : error instanceof Error
              ? error.message
              : "Could not load the repository.",
          { cause: error },
        );
      }
    },
    async render(value) {
      const selection = selectionSchema.parse(value);
      const snapshot = current;
      if (snapshot === undefined) throw new Error("Load a public release first.");
      const job = async (): Promise<StudioOutput> => {
        renderer ??= (async () => {
          const response = await fetch(monoUrl);
          if (!response.ok) throw new Error("The bundled font could not load. Refresh the page and retry.");
          return createBrowserTakumiRenderer(new Uint8Array(await response.arrayBuffer()));
        })();
        let adapter;
        try { adapter = await renderer; } catch (error) { renderer = undefined; throw error; }
        const pack = await buildStudioPack({ ...snapshot, config: DEFAULT_CONFIG, selection, renderer: adapter,
          version: packageJson.version, generatedAt: new Date().toISOString(), brandSource: "Public repository brand or disclosed demo defaults, plus browser selections" });
        const output: StudioOutput = { files: pack.result.files.map((file) => ({ name: file.fileName, data: base64(file.bytes), width: file.width, height: file.height })),
          archive: base64(pack.archive), manifest: pack.manifest };
        const pdf = pack.downloads.find((file) => file.name === "story.pdf");
        if (pdf !== undefined) output.pdf = base64(pdf.bytes);
        return output;
      };
      const next = rendering.then(job, job);
      rendering = next;
      return next;
    },
  };
  mountStudio(root, backend);
}
