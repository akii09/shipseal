// Release stories: an ordered set of pages built from release facts, each rendered by the
// `story-page` template. Spec: docs/PROJECT_PLAN.md 25 (2026-09-13 decisions).
//
// Page order is fixed: cover, one page per change, an optional code page, an optional
// comparison of supplied screenshots, then the upgrade page.

import type { Config } from "../config/schema.js";
import { cleanLine, deterministicCopy, firstSentence } from "../copy/deterministic.js";
import { fact } from "../facts/fact.js";
import type { Fact, Facts, StoryPage } from "../facts/schema.js";
import { ShipsealError } from "./errors.js";
import { generate, type GenerateInput, type GenerateResult } from "./generate.js";

const DEFAULT_CHANGE_PAGES = 4;
const STORY_FORMATS = "portrait, square, og, github-social, x, linkedin, or producthunt";

export function storyFacts(
  facts: Facts,
  config: Config,
  name: string,
  generatedAt: string,
): Facts {
  const release = facts.release;
  if (release === undefined) {
    throw new ShipsealError(
      "story.no-release",
      "No release facts are available for a story.",
      "Choose a published release or pass --tag to a local repository.",
    );
  }
  const copy = deterministicCopy(facts, config.release?.maxHighlights, name);
  const configured = (value: string, ref: string): Fact<string> =>
    fact(value, { source: "user-config", ref, fetchedAt: generatedAt });

  const changes = [...release.breaking, ...release.features, ...release.fixes];
  // The cover headline carries the provenance of the change it was taken from, so a card
  // number or claim is always traceable back to the release notes.
  const headlineSource =
    release.headline ??
    changes.find((item) => cleanLine(firstSentence(item.value)) === copy.headline) ??
    release.version;
  const pages: StoryPage[] = [
    {
      kind: "cover",
      title: fact(copy.headline, headlineSource.provenance),
      body:
        release.subheadline ??
        facts.project.tagline ??
        fact("Release notes", release.tag.provenance),
    },
  ];

  for (const item of changes.slice(0, config.release?.maxHighlights ?? DEFAULT_CHANGE_PAGES)) {
    // The title is the entry's first sentence, so the body is what follows it. Passing the
    // whole entry would print that sentence twice on the same page.
    const collapsed = item.value.replaceAll(/\s+/g, " ").trim();
    const sentence = firstSentence(collapsed);
    const remainder = collapsed.slice(sentence.length).trim();
    pages.push({
      kind: "change",
      title: fact(cleanLine(sentence), item.provenance),
      body: fact(remainder.length > 0 ? cleanLine(remainder) : "", item.provenance),
    });
  }

  if (release.codeSnippet !== undefined) {
    pages.push({
      kind: "code",
      title: fact("Code example", release.codeSnippet.provenance),
      body: fact(release.codeSnippet.value.code, release.codeSnippet.provenance),
    });
  }

  const options = config.release?.story;
  if (options?.before !== undefined && options.after !== undefined) {
    pages.push({
      kind: "comparison",
      title: configured("Before and after", "release.story.before + release.story.after"),
      body: configured("Supplied screenshots", "release.story"),
      before: configured(options.before, "release.story.before"),
      after: configured(options.after, "release.story.after"),
    });
  }

  const hasUpgrade = options?.upgrade !== undefined && options.upgrade.trim().length > 0;
  let upgrade: Fact<string>;
  if (hasUpgrade && options?.upgrade !== undefined) {
    // Trimmed, not cleaned: this is a command the maintainer expects to be copied and run.
    // cleanLine capitalises the first letter and collapses newlines, which breaks both a
    // `pnpm add ...` line and a multi-line block.
    upgrade = configured(options.upgrade.trim(), "release.story.upgrade");
  } else {
    // Never infer an upgrade command from a package name: the release may be breaking, and
    // an invented command is a number-shaped claim the manifest cannot back.
    const repo = facts.project.repo;
    upgrade =
      repo === undefined
        ? fact(copy.cta, facts.project.url?.provenance ?? facts.project.name.provenance)
        : fact(
            `Read the release notes at github.com/${repo.value}/releases/tag/${encodeURIComponent(release.tag.value)}`,
            repo.provenance,
          );
  }
  pages.push({
    kind: "upgrade",
    title: fact(hasUpgrade ? "How to upgrade" : "Get the release", upgrade.provenance),
    body: upgrade,
  });

  return { ...facts, story: pages };
}

export async function generateStory(input: GenerateInput): Promise<GenerateResult> {
  const facts = storyFacts(input.facts, input.config, input.brand.name, input.generatedAt);
  const pages = facts.story ?? [];
  const result: GenerateResult = {
    files: [],
    warnings: [],
    missing: [],
    facts,
    copy: input.copy,
    copyMode: "deterministic",
    generatedAt: input.generatedAt,
    computed: {},
  };
  const formats = input.config.formats ?? ["portrait"];
  if (formats.length === 0 || formats.includes("readme-banner")) {
    throw new ShipsealError(
      "story.bad-format",
      "The story format selection contains no supported output or includes readme-banner.",
      `Use ${STORY_FORMATS}.`,
    );
  }

  for (const [index, page] of pages.entries()) {
    // One renderer instance is shared across pages, so renders are sequential by design.
    // eslint-disable-next-line no-await-in-loop
    const rendered = await generate({
      ...input,
      facts: { ...facts, story: [page] },
      config: {
        ...input.config,
        formats,
        release: { ...input.config.release, templates: ["story-page"] },
      },
    });
    const id = `story-${String(index + 1).padStart(2, "0")}-${page.kind}`;
    result.files.push(
      ...rendered.files.map((file) => ({
        ...file,
        fileName: file.fileName.replace("story-page", id),
      })),
    );
    result.warnings.push(
      ...rendered.warnings.map((warning) => ({
        ...warning,
        slot: `page-${String(index + 1)}.${warning.slot}`,
      })),
    );
    result.missing.push(...rendered.missing);
    result.computed[`story.pages[${String(index)}]`] = {
      value: {
        kind: page.kind,
        files: result.files
          .filter((file) => file.fileName.startsWith(id))
          .map((file) => file.fileName),
      },
      computedFrom: [`story[${String(index)}].title`, `story[${String(index)}].body`],
    };
  }

  if (facts.release?.codeSnippet === undefined) {
    result.missing.push({
      template: "story-page",
      fact: "release.codeSnippet",
      effect: "code page omitted",
    });
  }
  if (pages.every((page) => page.kind !== "change")) {
    result.missing.push({
      template: "story-page",
      fact: "release.features",
      effect: "change pages omitted because release notes have no changes",
    });
  }
  return result;
}
