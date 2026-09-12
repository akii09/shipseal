import type { StudioSelection } from "./pack.js";

export interface StudioState {
  name: string;
  style: StudioSelection["style"];
  theme: StudioSelection["theme"];
  accent: string;
  headline: string;
  upgrade: string;
  headlines: string[];
  notes: string[];
  releases: Array<{ tag: string; label: string }>;
  tag: string;
}

export interface StudioOutput {
  files: Array<{ name: string; data: string; width: number; height: number }>;
  archive: string;
  pdf?: string;
  manifest: { warnings: Array<{ format: string; slot: string; action: string }>; missing: Array<{ fact: string; effect: string }> };
}

export interface StudioBackend {
  mode: "public" | "local";
  load(repo: string, tag?: string): Promise<StudioState>;
  render(selection: StudioSelection): Promise<StudioOutput>;
  save?(selection: StudioSelection): Promise<void>;
}

export const studioMarkup = `
<style>
.studio{--ink:#eae9e6;--muted:#a1a1aa;--panel:#18181b;--line:#343438;color:var(--ink);background:#0c0c0f;font:15px/1.5 system-ui,sans-serif;min-height:80vh;padding:clamp(16px,3vw,40px);border-radius:20px}
.studio *{box-sizing:border-box}.studio h1{font-size:clamp(30px,4vw,48px);line-height:1.1;letter-spacing:-.04em;margin:12px 0}.studio h2{font-size:20px;margin:0 0 12px}.studio p{color:var(--muted);max-width:70ch}.studio .eyebrow{color:#fb756d;text-transform:uppercase;letter-spacing:.16em;font-size:12px}
.studio .workspace{display:grid;grid-template-columns:280px minmax(0,1fr);gap:24px;margin-top:28px}.studio .controls{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;align-self:start}.studio label{display:block;font-size:13px;margin:14px 0 6px}.studio input,.studio select,.studio textarea{width:100%;background:#101014;border:1px solid #48484f;color:var(--ink);border-radius:8px;padding:10px;font:inherit}.studio input[type=color]{height:44px;padding:4px}.studio textarea{resize:vertical;min-height:90px}.studio button,.studio a.download{display:inline-block;border:1px solid #fb756d;background:#fa6259;color:#170a09;padding:11px 18px;border-radius:8px;font:600 14px system-ui;cursor:pointer;text-decoration:none}.studio button.secondary,.studio a.secondary{background:transparent;color:var(--ink);border-color:var(--line)}
.studio :focus-visible{outline:3px solid #fbbc78;outline-offset:3px}.studio button:disabled{opacity:.5;cursor:wait}.studio .load-row{display:flex;gap:10px;max-width:850px;align-items:end}.studio .load-row>div{flex:1}.studio .load-row button{white-space:nowrap}.studio .actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.studio .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:20px}.studio figure{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel)}.studio figure img{width:100%;height:auto;display:block}.studio figcaption{padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;overflow-wrap:anywhere;font-size:12px}.studio figcaption a{color:#fb9a90}.studio .status{padding:14px 0;min-height:48px}.studio .notice{border-left:3px solid #fbad59;background:#241e18;padding:12px 16px;margin:12px 0;color:#f2d2ae;white-space:pre-wrap}.studio details{margin-top:16px}.studio pre{max-height:360px;overflow:auto;white-space:pre-wrap;font-size:12px}.studio .placeholder{border:1px dashed var(--line);border-radius:14px;padding:70px 24px;text-align:center;color:var(--muted)}.studio [hidden]{display:none!important}.studio .helper{font-size:12px;color:var(--muted)}
@media(max-width:760px){.studio .workspace{grid-template-columns:1fr}.studio .load-row{flex-direction:column;align-items:stretch}.studio .controls{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.studio .controls .wide{grid-column:1/-1}}
</style>
<section class="studio">
<div class="eyebrow">Shipseal studio</div><h1>Your next release, ready to share.</h1>
<p>Choose a release. Make it yours. Download a complete pack with sources attached.</p>
<form data-load class="load-row"><div><label for="studio-repo">Public GitHub repository</label><input id="studio-repo" name="repo" placeholder="owner/repository" required autocomplete="off" spellcheck="false"></div><button type="submit">Try my repo</button></form>
<p data-privacy class="helper">No account or API key. GitHub requests go directly from your browser. Images render on your device.</p>
<div data-status class="status" role="status" aria-live="polite">Load a repository to begin.</div><div data-notes hidden class="notice"></div>
<div class="workspace"><form data-controls class="controls" hidden>
<div class="wide"><h2>Make it yours</h2><label for="studio-release">Release</label><select id="studio-release"></select></div>
<div><label for="studio-pack">Pack</label><select id="studio-pack"><option value="story">Release story</option><option value="release">Standard release</option></select></div>
<div><label for="studio-style">Story style</label><select id="studio-style"><option value="minimal">Minimal</option><option value="editorial">Editorial</option><option value="terminal">Terminal</option></select></div>
<div><label for="studio-theme">Theme</label><select id="studio-theme"><option value="dark">Dark</option><option value="light">Light</option></select></div>
<div><label for="studio-accent">Accent</label><input id="studio-accent" type="color" value="#fb4c4b"></div>
<div class="wide"><label for="studio-format">Format</label><select id="studio-format"><option value="portrait">Portrait carousel</option><option value="square">Square</option><option value="og">Link preview</option><option value="github-social">GitHub social</option><option value="x">X</option><option value="linkedin">LinkedIn</option><option value="producthunt">Product Hunt</option><option value="all">All supported formats</option></select></div>
<div class="wide"><label for="studio-headline">Headline</label><input id="studio-headline" list="studio-headlines" maxlength="500" placeholder="Automatic from release notes"><datalist id="studio-headlines"></datalist><label for="studio-upgrade">Upgrade instructions (optional)</label><textarea id="studio-upgrade" maxlength="4000" placeholder="Leave blank to link to the release notes"></textarea></div>
<div class="wide actions"><button type="submit" data-render>Update preview</button><button type="button" class="secondary" data-save hidden>Save to repo</button></div>
<p class="wide helper">Story styles apply to the story pack. Standard release templates keep their established layout. The ZIP includes brand and config files for local use.</p>
</form><div><div data-downloads class="actions" hidden></div><div data-warnings class="notice" hidden></div><div data-gallery class="gallery"><div class="placeholder">Your release images will appear here.<br>Nothing is posted automatically.</div></div><details data-evidence hidden><summary>Sources and rendering details</summary><pre data-manifest></pre></details></div></div>
</section>`;

/**
 * Kept in step with selectionSchema by hand. This module must stay free of runtime imports:
 * it is bundled on its own as dist/studio-client.js and served to the browser, so importing
 * the schema would pull zod and the whole render pipeline in with it.
 */
const SELECTABLE_FORMATS = [
  "portrait",
  "square",
  "og",
  "github-social",
  "x",
  "linkedin",
  "producthunt",
  "all",
] as const satisfies readonly StudioSelection["format"][];

const isSelectableFormat = (value: string): value is StudioSelection["format"] =>
  SELECTABLE_FORMATS.some((format) => format === value);

export function mountStudio(root: HTMLElement, backend: StudioBackend): void {
  root.innerHTML = studioMarkup;

  const find = <T extends Element>(selector: string, type: { new (...args: never[]): T }): T => {
    const element = root.querySelector(selector);
    if (!(element instanceof type)) {
      throw new Error(`Missing studio element: ${selector}`);
    }
    return element;
  };
  const input = (id: string) => find(`#studio-${id}`, HTMLInputElement);
  const select = (id: string) => find(`#studio-${id}`, HTMLSelectElement);

  const status = find("[data-status]", HTMLDivElement);
  const controls = find("[data-controls]", HTMLFormElement);
  const gallery = find("[data-gallery]", HTMLDivElement);
  const downloads = find("[data-downloads]", HTMLDivElement);
  const warnings = find("[data-warnings]", HTMLDivElement);
  const evidence = find("[data-evidence]", HTMLDetailsElement);
  const save = find("[data-save]", HTMLButtonElement);
  const upgrade = find("#studio-upgrade", HTMLTextAreaElement);

  let state: StudioState | undefined;
  // Every load and render takes the next revision. A result from an older revision is stale
  // and is dropped, so a slow render cannot overwrite a newer one.
  let revision = 0;
  let urls: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const showError = (error: unknown) => {
    status.textContent =
      error instanceof Error ? error.message : "The preview failed. Retry the request.";
  };

  const clearUrls = () => {
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
    urls = [];
  };

  const link = (label: string, name: string, data: string, mime: string): HTMLAnchorElement => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    urls.push(url);
    const anchor = document.createElement("a");
    anchor.textContent = label;
    anchor.href = url;
    anchor.download = name;
    return anchor;
  };

  const selection = (): StudioSelection => {
    // The selects restrict ordinary browser input; the backend validates regardless.
    const style = select("style").value;
    const format = select("format").value;
    return {
      pack: select("pack").value === "release" ? "release" : "story",
      style: style === "editorial" || style === "terminal" ? style : "minimal",
      theme: select("theme").value === "light" ? "light" : "dark",
      accent: input("accent").value,
      headline: input("headline").value,
      upgrade: upgrade.value,
      format: isSelectableFormat(format) ? format : "portrait",
    };
  };

  const busy = (value: boolean) => {
    for (const button of root.querySelectorAll("button")) {
      button.disabled = value;
    }
  };

  const render = async () => {
    if (state === undefined) {
      return;
    }
    const current = ++revision;
    downloads.hidden = true;
    save.hidden = true;
    warnings.hidden = true;
    status.textContent = "Rendering your pack. The first browser render also loads the renderer.";
    busy(true);
    try {
      const result = await backend.render(selection());
      if (current !== revision) {
        return;
      }
      clearUrls();
      gallery.replaceChildren();
      downloads.replaceChildren();
      for (const file of result.files) {
        const download = link("Download PNG", file.name, file.data, "image/png");
        const figure = document.createElement("figure");
        const img = document.createElement("img");
        img.src = download.href;
        img.alt = `${state.name}: ${file.name}`;
        img.width = file.width;
        img.height = file.height;
        const caption = document.createElement("figcaption");
        const label = document.createElement("span");
        label.textContent = file.name;
        caption.append(label, download);
        figure.append(img, caption);
        gallery.append(figure);
      }
      const zip = link("Download pack", "shipseal-pack.zip", result.archive, "application/zip");
      zip.className = "download";
      downloads.append(zip);
      if (result.pdf !== undefined) {
        const pdf = link("Download carousel PDF", "story.pdf", result.pdf, "application/pdf");
        pdf.className = "download secondary";
        downloads.append(pdf);
      }
      downloads.hidden = false;

      // Fit warnings and missing facts are always shown: shipping overflowing text silently
      // is forbidden (AGENTS.md rule 5).
      const notices = [
        ...result.manifest.warnings.map(
          (warning) =>
            `${warning.format}: ${warning.slot} was ${warning.action}. Shorten the text or choose a larger format.`,
        ),
        ...result.manifest.missing.map((missing) => `${missing.fact}: ${missing.effect}.`),
      ];
      warnings.textContent = notices.join("\n");
      warnings.hidden = notices.length === 0;
      find("[data-manifest]", HTMLPreElement).textContent = JSON.stringify(
        result.manifest,
        null,
        2,
      );
      evidence.hidden = false;
      save.hidden = backend.save === undefined;
      status.textContent = `${String(result.files.length)} images ready for ${state.name}. ${
        notices.length > 0 ? "Review the notices before sharing." : "No fitting warnings."
      }`;
    } catch (error) {
      if (current === revision) {
        showError(error);
      }
    } finally {
      if (current === revision) {
        busy(false);
      }
    }
  };

  const load = async (tag?: string) => {
    const current = ++revision;
    state = undefined;
    clearUrls();
    gallery.replaceChildren();
    downloads.hidden = true;
    controls.hidden = true;
    save.hidden = true;
    warnings.hidden = true;
    evidence.hidden = true;
    status.textContent = "Reading release facts...";
    busy(true);
    try {
      const next = await backend.load(input("repo").value, tag);
      if (current !== revision) {
        return;
      }
      state = next;
      select("release").replaceChildren(
        ...next.releases.map((release) => {
          const option = document.createElement("option");
          option.value = release.tag;
          option.textContent = release.label;
          return option;
        }),
      );
      select("release").value = next.tag;
      select("style").value = next.style;
      select("theme").value = next.theme;
      input("accent").value = next.accent;
      input("headline").value = next.headline;
      upgrade.value = next.upgrade;
      find("#studio-headlines", HTMLDataListElement).replaceChildren(
        ...next.headlines.map((headline) => {
          const option = document.createElement("option");
          option.value = headline;
          return option;
        }),
      );
      const notes = find("[data-notes]", HTMLDivElement);
      notes.textContent = next.notes.join("\n");
      notes.hidden = next.notes.length === 0;
      controls.hidden = false;
      await render();
    } catch (error) {
      showError(error);
      busy(false);
    }
  };

  find("[data-load]", HTMLFormElement).addEventListener("submit", (event) => {
    event.preventDefault();
    void load();
  });
  controls.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    void render();
  });
  select("release").addEventListener("change", () => {
    void load(select("release").value);
  });
  controls.addEventListener("input", (event) => {
    if (event.target === select("release")) {
      return;
    }
    // The standard release templates are landscape only, so a portrait choice is corrected
    // rather than sent to the backend to be rejected.
    if (
      select("pack").value === "release" &&
      ["portrait", "square", "producthunt"].includes(select("format").value)
    ) {
      select("format").value = "all";
    }
    select("style").disabled = select("pack").value === "release";
    downloads.hidden = true;
    save.hidden = true;
    ++revision;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void render();
    }, 500);
  });
  save.addEventListener("click", async () => {
    busy(true);
    try {
      await backend.save?.(selection());
      status.textContent =
        "Saved brand and release settings to .shipseal. Future local runs will use these choices.";
    } catch (error) {
      showError(error);
    } finally {
      busy(false);
    }
  });

  if (backend.mode === "local") {
    find("[data-load]", HTMLFormElement).hidden = true;
    find("[data-privacy]", HTMLParagraphElement).textContent =
      "Local preview. Files stay on this computer. Save to repo writes only your Shipseal brand and config settings.";
    void load();
  }
  window.addEventListener("pagehide", clearUrls, { once: true });
}
