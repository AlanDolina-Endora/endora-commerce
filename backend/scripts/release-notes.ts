/**
 * Release notes for a `vX.Y.Z` tag, assembled from the changesets changelogs.
 * `specs/conventions/release-intent.md` § *The release page and the Discord post*
 * is the home of the rule; this script is its instrument.
 *
 * ## What it reads and what it writes
 *
 * `changeset version` writes one `CHANGELOG.md` per package and nothing
 * repository-wide, so a release has no single file to copy a description
 * from. This script takes the tag, finds the previous `v*` tag by version
 * order, and for every `packages/**` changelog present at the tag collects the
 * `## <version>` sections that the previous tag did not have. From those it
 * writes three files into `--out <dir>`:
 *
 *   - `release-body.md` — the GitHub Release description: a census, the
 *     changes **deduplicated by changeset id** (one changeset lands in every
 *     package it names, so 73 changelogs carry 49 changes), grouped as
 *     breaking / minor / patch, and the package table.
 *   - `release-notes-<tag>.md` — every new section of every changelog, in
 *     full, uploaded as a release asset. One release is ~7 700 changelog lines
 *     and GitHub's description limit is 125 000 characters; the full text is
 *     an attachment by necessity, not by taste.
 *   - `discord.json` — a webhook payload: title, link, census and the first
 *     changes as highlights, held under Discord's 4 096-character embed limit.
 *
 * ## Why it refuses rather than writing an empty page
 *
 * A tag on a commit whose changelogs gained no section is not a release of
 * anything: it is a tag pushed before `changeset version` ran, or on the
 * wrong commit. Writing three files that say "0 packages" and exiting 0
 * would publish a release page describing nothing, which is the same shape
 * as every other silent green this repository has recorded. So that case
 * exits 2, and the workflow stops before `gh release create`.
 *
 * Dependency-free, erasable types only: `node backend/scripts/release-notes.ts`
 * runs it straight after checkout, exactly like `dco-signoff.ts`.
 *
 * Usage:
 *   node backend/scripts/release-notes.ts <tag> --out <dir> [--previous <tag>|none]
 *                                        [--repo-url <url>]
 * Exit 0 = three files written; 1 = usage; 2 = refused.
 */
/* eslint-disable no-console -- CLI: stdout/stderr is the interface. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type ChangeLevel = 'major' | 'minor' | 'patch';

/** One `- …` bullet of a changelog section, with its continuation lines. */
export interface ChangelogEntry {
  /** The changeset id (`1190180:`), or null for a hand-written bullet. */
  readonly id: string | null;
  readonly level: ChangeLevel;
  /** The bullet's full markdown, de-indented, without the id prefix. */
  readonly text: string;
  /** Whether a `- Updated dependencies [...]` bullet, which no reader needs twice. */
  readonly dependencyBump: boolean;
}

export interface ChangelogSection {
  readonly version: string;
  readonly entries: readonly ChangelogEntry[];
  /** The section's markdown as written, heading included. */
  readonly markdown: string;
}

export interface Changelog {
  /** From the `# <name>` title line; the path's directory when absent. */
  readonly packageName: string;
  readonly sections: readonly ChangelogSection[];
}

const LEVEL_HEADINGS: Readonly<Record<string, ChangeLevel>> = {
  'Major Changes': 'major',
  'Minor Changes': 'minor',
  'Patch Changes': 'patch',
};

const ENTRY_ID = /^- ([0-9a-f]{7,40}): ?(.*)$/;

export function parseChangelog(source: string, fallbackName: string): Changelog {
  const lines = source.split('\n');
  let packageName = fallbackName;
  const sections: ChangelogSection[] = [];
  let current: { version: string; entries: ChangelogEntry[]; lines: string[] } | null = null;
  let level: ChangeLevel | null = null;
  let bullet: { id: string | null; level: ChangeLevel; lines: string[] } | null = null;

  const closeBullet = (): void => {
    if (current === null || bullet === null) return;
    const text = bullet.lines.join('\n').replace(/\s+$/, '');
    current.entries.push({
      id: bullet.id,
      level: bullet.level,
      text,
      dependencyBump: /^Updated dependencies\b/.test(text),
    });
    bullet = null;
  };
  const closeSection = (): void => {
    closeBullet();
    if (current === null) return;
    sections.push({
      version: current.version,
      entries: current.entries,
      markdown: current.lines.join('\n').replace(/\s+$/, '') + '\n',
    });
    current = null;
    level = null;
  };

  for (const line of lines) {
    const title = /^# (.+?)\s*$/.exec(line);
    if (title !== null && current === null) {
      packageName = title[1]!;
      continue;
    }
    const version = /^## (\S+)\s*$/.exec(line);
    if (version !== null) {
      closeSection();
      current = { version: version[1]!, entries: [], lines: [line] };
      continue;
    }
    if (current === null) continue;
    current.lines.push(line);
    const heading = /^### (.+?)\s*$/.exec(line);
    if (heading !== null) {
      closeBullet();
      level = LEVEL_HEADINGS[heading[1]!] ?? null;
      continue;
    }
    if (line.startsWith('- ')) {
      closeBullet();
      if (level === null) continue;
      const withId = ENTRY_ID.exec(line);
      bullet =
        withId === null
          ? { id: null, level, lines: [line.slice(2)] }
          : { id: withId[1]!, level, lines: [withId[2]!] };
      continue;
    }
    if (bullet !== null) {
      // Continuation lines are indented by two spaces; blank lines stay.
      bullet.lines.push(line.startsWith('  ') ? line.slice(2) : line);
    }
  }
  closeSection();
  return { packageName, sections };
}

/** A package's part of a release: the sections the previous tag did not have. */
export interface PackageRelease {
  readonly packageName: string;
  readonly path: string;
  readonly sections: readonly ChangelogSection[];
  /** The highest level among the new sections' own (non-bump) entries, or null for a bump-only release. */
  readonly level: ChangeLevel | null;
  /** The newest new section's version. */
  readonly version: string;
}

export interface ChangelogPair {
  readonly path: string;
  /** The file at the released tag. */
  readonly after: string;
  /** The file at the previous tag, or null when it did not exist there. */
  readonly before: string | null;
}

const LEVEL_RANK: Readonly<Record<ChangeLevel, number>> = { major: 3, minor: 2, patch: 1 };

export function newSectionsOf(pair: ChangelogPair): PackageRelease | null {
  const after = parseChangelog(pair.after, pair.path);
  const seen = new Set(
    pair.before === null ? [] : parseChangelog(pair.before, pair.path).sections.map((s) => s.version),
  );
  const sections = after.sections.filter((section) => !seen.has(section.version));
  if (sections.length === 0) return null;
  let level: ChangeLevel | null = null;
  for (const entry of sections.flatMap((section) => section.entries)) {
    if (entry.dependencyBump) continue;
    if (level === null || LEVEL_RANK[entry.level] > LEVEL_RANK[level]) level = entry.level;
  }
  return { packageName: after.packageName, path: pair.path, sections, level, version: sections[0]!.version };
}

/** One change across every package it landed in. */
export interface ReleaseChange {
  readonly key: string;
  readonly level: ChangeLevel;
  readonly breaking: boolean;
  /** The lead's first sentence, marker stripped, unwrapped to one line. */
  readonly headline: string;
  /** The first paragraph, marker stripped. */
  readonly lead: string;
  readonly text: string;
  readonly packages: readonly string[];
}

export interface ReleaseSummary {
  readonly packages: readonly PackageRelease[];
  readonly changes: readonly ReleaseChange[];
}

/** The marker changesets in this repository open a breaking entry with: `**Breaking.**`. */
const BREAKING_MARKER = /^\s*\*\*breaking[.:!]?\*\*[:\s—-]*/i;
/** A bold phrase naming breaking changes anywhere in the lead (`**Three breaking changes**`). */
const BREAKING_PHRASE = /\*\*[^*\n]*\bbreaking\b[^*\n]*\*\*/i;

/** The first sentence of a paragraph, or the whole paragraph when it has one. */
export function firstSentence(paragraph: string): string {
  const match = /^.*?[.!?](?=\s+[A-Z`*_(\[]|\s*$)/s.exec(paragraph);
  return (match === null ? paragraph : match[0]).trim();
}

export function summarize(packages: readonly PackageRelease[]): ReleaseSummary {
  const byKey = new Map<string, { entry: ChangelogEntry; packages: string[] }>();
  for (const pkg of packages) {
    for (const section of pkg.sections) {
      for (const entry of section.entries) {
        if (entry.dependencyBump) continue;
        const key = entry.id ?? `${entry.level}:${entry.text}`;
        const known = byKey.get(key);
        if (known === undefined) byKey.set(key, { entry, packages: [pkg.packageName] });
        else if (!known.packages.includes(pkg.packageName)) known.packages.push(pkg.packageName);
      }
    }
  }
  const changes: ReleaseChange[] = [];
  for (const [key, { entry, packages: names }] of byKey) {
    const stripped = entry.text.replace(BREAKING_MARKER, '');
    const [firstParagraph = ''] = stripped.split(/\n\s*\n/);
    // Changelog paragraphs are hard-wrapped; a headline is a sentence, not a line.
    const lead = firstParagraph.replace(/\s*\n\s*/g, ' ').trim();
    const breaking =
      entry.level === 'major' || BREAKING_MARKER.test(entry.text) || BREAKING_PHRASE.test(lead);
    changes.push({
      key,
      level: entry.level,
      breaking,
      headline: firstSentence(lead),
      lead,
      text: entry.text,
      packages: [...names].sort(),
    });
  }
  changes.sort((a, b) => {
    if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
    return LEVEL_RANK[b.level] - LEVEL_RANK[a.level];
  });
  return {
    packages: [...packages].sort((a, b) => a.packageName.localeCompare(b.packageName)),
    changes,
  };
}

export interface Census {
  readonly packages: number;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly bumpOnly: number;
  readonly changes: number;
  readonly breaking: number;
}

export function census(summary: ReleaseSummary): Census {
  const count = (level: ChangeLevel | null): number =>
    summary.packages.filter((pkg) => pkg.level === level).length;
  return {
    packages: summary.packages.length,
    major: count('major'),
    minor: count('minor'),
    patch: count('patch'),
    bumpOnly: count(null),
    changes: summary.changes.length,
    breaking: summary.changes.filter((change) => change.breaking).length,
  };
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > max / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

function censusSentence(c: Census): string {
  const parts: string[] = [];
  if (c.major > 0) parts.push(`${c.major} major`);
  if (c.minor > 0) parts.push(`${c.minor} minor`);
  if (c.patch > 0) parts.push(`${c.patch} patch`);
  if (c.bumpOnly > 0) parts.push(`${c.bumpOnly} dependency-only`);
  const noun = c.packages === 1 ? 'package' : 'packages';
  return `${c.packages} ${noun} released (${parts.join(', ')}), carrying ${c.changes} ${
    c.changes === 1 ? 'change' : 'changes'
  }${c.breaking > 0 ? `, ${c.breaking} of them breaking` : ''}.`;
}

function packageList(names: readonly string[], shown: number): string {
  const head = names.slice(0, shown).map((name) => `\`${name}\``);
  const rest = names.length - head.length;
  return rest > 0 ? `${head.join(', ')} and ${rest} more` : head.join(', ');
}

export interface RenderOptions {
  readonly tag: string;
  readonly previousTag: string | null;
  readonly repoUrl: string;
  readonly assetName: string;
}

/** GitHub caps a release description at 125 000 characters; stay well under. */
export const RELEASE_BODY_LIMIT = 120_000;

export function renderReleaseBody(summary: ReleaseSummary, options: RenderOptions): string {
  const c = census(summary);
  const version = options.tag.replace(/^v/, '');
  const out: string[] = [];
  out.push(`# Endora Commerce ${version}`, '');
  out.push(censusSentence(c));
  if (options.previousTag !== null) {
    out.push(
      '',
      `Compare: [\`${options.previousTag}...${options.tag}\`](${options.repoUrl}/compare/${options.previousTag}...${options.tag}).`,
    );
  }
  out.push(
    '',
    `The full per-package notes are attached as \`${options.assetName}\`; each package's ` +
      `\`CHANGELOG.md\` at this tag is the record this page summarises. Upgrade an instance with ` +
      `the CLI's \`upgrade\` command — see the documentation's *Upgrading an instance* page.`,
    '',
  );
  const groups: ReadonlyArray<readonly [string, (change: ReleaseChange) => boolean]> = [
    ['Breaking changes', (change) => change.breaking],
    ['Minor changes', (change) => !change.breaking && change.level === 'minor'],
    ['Patch changes', (change) => !change.breaking && change.level === 'patch'],
    ['Other changes', (change) => !change.breaking && change.level === 'major'],
  ];
  for (const [heading, matches] of groups) {
    const changes = summary.changes.filter(matches);
    if (changes.length === 0) continue;
    out.push(`## ${heading}`, '');
    for (const change of changes) {
      out.push(`- ${truncate(change.lead, 400)}  \n  ${packageList(change.packages, 3)}`);
    }
    out.push('');
  }
  out.push('## Packages', '', '| Package | Version | Change |', '| --- | --- | --- |');
  for (const pkg of summary.packages) {
    out.push(`| \`${pkg.packageName}\` | ${pkg.version} | ${pkg.level ?? 'dependencies'} |`);
  }
  out.push('');
  const body = out.join('\n');
  if (body.length <= RELEASE_BODY_LIMIT) return body;
  const notice = `\n\n_Truncated: the full notes are in the attached \`${options.assetName}\`._\n`;
  return body.slice(0, RELEASE_BODY_LIMIT - notice.length) + notice;
}

export function renderFullNotes(summary: ReleaseSummary, options: RenderOptions): string {
  const version = options.tag.replace(/^v/, '');
  const out: string[] = [`# Endora Commerce ${version} — per-package changelog sections`, ''];
  out.push(censusSentence(census(summary)), '');
  for (const pkg of summary.packages) {
    out.push(`## ${pkg.packageName}`, '');
    for (const section of pkg.sections) {
      // Demote the section's headings one level under the package heading.
      out.push(section.markdown.replace(/^(#{2,5}) /gm, '#$1 ').trimEnd(), '');
    }
  }
  return out.join('\n');
}

/** Discord's embed limits: title 256, description 4 096, whole embed 6 000. */
export const DISCORD_DESCRIPTION_LIMIT = 4096;
const DISCORD_HIGHLIGHTS = 8;
const DISCORD_HEADLINE = 180;

export interface DiscordPayload {
  readonly username: string;
  readonly allowed_mentions: { readonly parse: readonly string[] };
  readonly embeds: ReadonlyArray<{
    readonly title: string;
    readonly url: string;
    readonly description: string;
    readonly color: number;
    readonly footer: { readonly text: string };
  }>;
}

export function renderDiscordPayload(
  summary: ReleaseSummary,
  options: Pick<RenderOptions, 'tag' | 'repoUrl'>,
): DiscordPayload {
  const c = census(summary);
  const version = options.tag.replace(/^v/, '');
  const url = `${options.repoUrl}/releases/tag/${options.tag}`;
  const highlights = summary.changes
    .slice(0, DISCORD_HIGHLIGHTS)
    .map(
      (change) =>
        `• ${change.breaking ? '**Breaking.** ' : ''}${truncate(change.headline, DISCORD_HEADLINE)}`,
    );
  const omitted = summary.changes.length - highlights.length;
  const lines = [
    censusSentence(c),
    '',
    '**Highlights**',
    ...highlights,
    ...(omitted > 0 ? [`… and ${omitted} more.`] : []),
    '',
    `Release notes and the full changelog: ${url}`,
  ];
  let description = lines.join('\n');
  while (description.length > DISCORD_DESCRIPTION_LIMIT && highlights.length > 0) {
    highlights.pop();
    description = [
      censusSentence(c),
      '',
      '**Highlights**',
      ...highlights,
      `… and ${summary.changes.length - highlights.length} more.`,
      '',
      `Release notes and the full changelog: ${url}`,
    ].join('\n');
  }
  return {
    username: 'Endora Commerce releases',
    // Changelog text is markdown written by contributors; it must not ping anyone.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: truncate(`Endora Commerce ${version}`, 256),
        url,
        description: truncate(description, DISCORD_DESCRIPTION_LIMIT),
        color: 0x2f6feb,
        footer: { text: `${c.packages} packages · ${c.changes} changes` },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The git half: tags and file contents at a tag.

const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

function versionOf(tag: string): readonly [number, number, number] | null {
  const match = STABLE_TAG.exec(tag);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}

/** The greatest stable `v*` tag strictly below `tag` by version order, or null. */
export function previousTagOf(tag: string, tags: readonly string[]): string | null {
  const own = versionOf(tag);
  if (own === null) return null;
  let best: { tag: string; version: readonly number[] } | null = null;
  for (const candidate of tags) {
    const version = versionOf(candidate);
    if (version === null || compareVersions(version, own) >= 0) continue;
    if (best === null || compareVersions(version, best.version) > 0) best = { tag: candidate, version };
  }
  return best?.tag ?? null;
}

function git(args: readonly string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function showAt(ref: string, path: string, cwd: string): string | null {
  const result = git(['show', `${ref}:${path}`], cwd);
  return result.status === 0 ? result.stdout : null;
}

export function readChangelogPairs(tag: string, previous: string | null, cwd: string): ChangelogPair[] {
  const listing = git(['ls-tree', '-r', '--name-only', tag, '--', 'packages'], cwd);
  if (listing.status !== 0) throw new Error(`git ls-tree ${tag} failed: ${listing.stderr.trim()}`);
  const paths = listing.stdout
    .split('\n')
    .filter((path) => path.endsWith('/CHANGELOG.md') && !path.includes('/node_modules/'))
    .sort();
  return paths.map((path) => ({
    path,
    after: showAt(tag, path, cwd) ?? '',
    before: previous === null ? null : showAt(previous, path, cwd),
  }));
}

function refuse(message: string): number {
  console.error(`release-notes: ${message}`);
  return 2;
}

interface Arguments {
  readonly tag: string;
  readonly out: string;
  readonly previous: string | null | undefined;
  readonly repoUrl: string;
}

function parseArguments(argv: readonly string[]): Arguments | null {
  let tag: string | null = null;
  let out: string | null = null;
  let previous: string | null | undefined;
  let repoUrl = 'https://github.com/endora-commerce/endora-commerce';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--out') out = argv[++i] ?? null;
    else if (arg === '--previous') {
      const value = argv[++i];
      previous = value === undefined ? undefined : value === 'none' ? null : value;
    } else if (arg === '--repo-url') repoUrl = (argv[++i] ?? repoUrl).replace(/\/+$/, '');
    else if (arg.startsWith('--') || tag !== null) return null;
    else tag = arg;
  }
  if (tag === null || out === null) return null;
  return { tag, out, previous, repoUrl };
}

export function main(argv: readonly string[], cwd: string = process.cwd()): number {
  const args = parseArguments(argv);
  if (args === null) {
    console.error(
      'usage: release-notes.ts <tag> --out <dir> [--previous <tag>|none] [--repo-url <url>]',
    );
    return 1;
  }
  if (versionOf(args.tag) === null) {
    return refuse(`${args.tag} is not a stable release tag of the form vX.Y.Z; nothing is written.`);
  }
  if (git(['rev-parse', '--verify', '--quiet', `refs/tags/${args.tag}`], cwd).status !== 0) {
    return refuse(`tag ${args.tag} does not exist here. Fetch the tags before running this.`);
  }
  let previous: string | null;
  if (args.previous !== undefined) previous = args.previous;
  else {
    const tags = git(['tag', '--list', 'v*'], cwd);
    if (tags.status !== 0) return refuse(`git tag --list failed: ${tags.stderr.trim()}`);
    previous = previousTagOf(args.tag, tags.stdout.split('\n').filter((line) => line !== ''));
  }
  if (previous !== null && git(['rev-parse', '--verify', '--quiet', `refs/tags/${previous}`], cwd).status !== 0) {
    return refuse(`the previous tag ${previous} does not exist here.`);
  }
  const pairs = readChangelogPairs(args.tag, previous, cwd);
  if (pairs.length === 0) {
    return refuse(`${args.tag} holds no packages/**/CHANGELOG.md, so there is nothing to describe.`);
  }
  const packages = pairs.map(newSectionsOf).filter((pkg): pkg is PackageRelease => pkg !== null);
  if (packages.length === 0) {
    return refuse(
      `no changelog under packages/ gained a section between ${previous ?? '(no previous tag)'} and ${args.tag}. ` +
        'A release tag belongs on the commit that merged the version pull request; this one describes nothing, ' +
        'so no release page is written.',
    );
  }
  const summary = summarize(packages);
  const assetName = `release-notes-${args.tag}.md`;
  const options: RenderOptions = { tag: args.tag, previousTag: previous, repoUrl: args.repoUrl, assetName };
  const out = resolve(cwd, args.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'release-body.md'), renderReleaseBody(summary, options));
  writeFileSync(join(out, assetName), renderFullNotes(summary, options));
  writeFileSync(join(out, 'discord.json'), `${JSON.stringify(renderDiscordPayload(summary, options), null, 2)}\n`);
  const c = census(summary);
  console.log(
    `release-notes: tag=${args.tag} previous=${previous ?? 'none'} packages=${c.packages} ` +
      `major=${c.major} minor=${c.minor} patch=${c.patch} dependency-only=${c.bumpOnly} ` +
      `changes=${c.changes} breaking=${c.breaking} out=${args.out}`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
