import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  census,
  DISCORD_DESCRIPTION_LIMIT,
  firstSentence,
  main,
  newSectionsOf,
  parseChangelog,
  previousTagOf,
  RELEASE_BODY_LIMIT,
  renderDiscordPayload,
  renderFullNotes,
  renderReleaseBody,
  summarize,
  type PackageRelease,
  type ReleaseSummary,
} from '../../../scripts/release-notes.js';

/**
 * The release notes assembler (`specs/conventions/release-intent.md` § *The
 * release page and the Discord post*).
 *
 * `changeset version` writes one changelog per package and one changeset lands
 * in every package it names, so the page a release tag produces has to be
 * **derived**: new sections per package, deduplicated by changeset id, grouped
 * by level, with the full text as an asset and a bounded Discord embed. Each
 * `it` below holds one of those derivations, and the last block runs the
 * script end to end on a throwaway repository with two tags, because the git
 * half — which tag is "previous", what the tree held at each — is where a
 * wrong answer would come from a right parser.
 */

const PLATFORM_0_1 = `# @endora-commerce/platform

## 0.1.0

### Minor Changes

- 1111111: The first release.
`;

const PLATFORM_0_2 = `# @endora-commerce/platform

## 0.2.0

### Minor Changes

- abc1234: Delivery methods are offered per sales channel, and the choice is
  enforced. A method a channel does not list is refused at placement.

  A second paragraph a reader of the page does not need.

### Patch Changes

- def5678: **Breaking.** \`composeApp\` no longer registers \`legacyFlag\`. Read
  \`processRunsWorkers\` instead.
- Updated dependencies [abc1234]
  - @endora-commerce/contracts@0.2.0

${PLATFORM_0_1.split('\n').slice(2).join('\n')}`;

const CONTRACTS_0_2 = `# @endora-commerce/contracts

## 0.2.0

### Minor Changes

- abc1234: Delivery methods are offered per sales channel, and the choice is
  enforced. A method a channel does not list is refused at placement.

  A second paragraph a reader of the page does not need.

- 9999999: Six more events are delivered to webhooks. **Three breaking changes**, described below.
`;

const BLOG_0_2 = `# @endora-commerce/mod-blog

## 0.2.0

### Patch Changes

- Updated dependencies [abc1234]
  - @endora-commerce/contracts@0.2.0
`;

function release(): ReleaseSummary {
  const packages = [
    { path: 'packages/platform/CHANGELOG.md', after: PLATFORM_0_2, before: PLATFORM_0_1 },
    { path: 'packages/contracts/CHANGELOG.md', after: CONTRACTS_0_2, before: null },
    { path: 'packages/modules/blog/CHANGELOG.md', after: BLOG_0_2, before: null },
  ]
    .map(newSectionsOf)
    .filter((pkg): pkg is PackageRelease => pkg !== null);
  return summarize(packages);
}

const OPTIONS = {
  tag: 'v0.2.0',
  previousTag: 'v0.1.0',
  repoUrl: 'https://github.com/endora-commerce/endora-commerce',
  assetName: 'release-notes-v0.2.0.md',
} as const;

describe('a changelog is read as versions, levels and bullets', () => {
  it('parses the title, the sections, the ids and the continuation lines', () => {
    const log = parseChangelog(PLATFORM_0_2, 'packages/platform/CHANGELOG.md');
    expect(log.packageName).toBe('@endora-commerce/platform');
    expect(log.sections.map((section) => section.version)).toEqual(['0.2.0', '0.1.0']);
    const [latest] = log.sections;
    expect(latest!.entries.map((entry) => [entry.id, entry.level, entry.dependencyBump])).toEqual([
      ['abc1234', 'minor', false],
      ['def5678', 'patch', false],
      [null, 'patch', true],
    ]);
    expect(latest!.entries[0]!.text).toContain('enforced. A method a channel does not list');
    expect(latest!.entries[0]!.text).toContain('\n\nA second paragraph');
    expect(latest!.markdown.startsWith('## 0.2.0\n')).toBe(true);
  });

  it('a package contributes only the sections the previous tag did not have', () => {
    const platform = newSectionsOf({
      path: 'packages/platform/CHANGELOG.md',
      after: PLATFORM_0_2,
      before: PLATFORM_0_1,
    });
    expect(platform?.sections.map((section) => section.version)).toEqual(['0.2.0']);
    expect(platform?.version).toBe('0.2.0');
    expect(platform?.level).toBe('minor');
    expect(
      newSectionsOf({ path: 'packages/platform/CHANGELOG.md', after: PLATFORM_0_2, before: PLATFORM_0_2 }),
    ).toBeNull();
    // No previous tag: every section is new.
    expect(
      newSectionsOf({ path: 'packages/platform/CHANGELOG.md', after: PLATFORM_0_2, before: null })
        ?.sections.length,
    ).toBe(2);
  });
});

describe('the release is one list of changes, not one list per package', () => {
  it('deduplicates by changeset id, ranks breaking first and counts the packages', () => {
    const summary = release();
    expect(summary.packages.map((pkg) => pkg.packageName)).toEqual([
      '@endora-commerce/contracts',
      '@endora-commerce/mod-blog',
      '@endora-commerce/platform',
    ]);
    // Breaking first, then by level, so the page opens with what an upgrade must know.
    expect(summary.changes.map((change) => [change.key, change.level, change.breaking])).toEqual([
      ['9999999', 'minor', true],
      ['def5678', 'patch', true],
      ['abc1234', 'minor', false],
    ]);
    const shared = summary.changes.find((change) => change.key === 'abc1234');
    expect(shared?.packages).toEqual(['@endora-commerce/contracts', '@endora-commerce/platform']);
    expect(shared?.headline).toBe(
      'Delivery methods are offered per sales channel, and the choice is enforced.',
    );
    expect(shared?.lead).not.toContain('\n');
    expect(shared?.lead).not.toContain('second paragraph');
    const marked = summary.changes.find((change) => change.key === 'def5678');
    expect(marked?.headline).toBe('`composeApp` no longer registers `legacyFlag`.');
    expect(census(summary)).toEqual({
      packages: 3,
      major: 0,
      minor: 2,
      patch: 0,
      bumpOnly: 1,
      changes: 3,
      breaking: 2,
    });
  });

  it('a headline is the first sentence of the unwrapped paragraph', () => {
    expect(firstSentence('One. Two.')).toBe('One.');
    expect(firstSentence('Reads `a.b` and `c.d` fields. Then more.')).toBe('Reads `a.b` and `c.d` fields.');
    expect(firstSentence('Version 0.2.0 ships. Next')).toBe('Version 0.2.0 ships.');
    expect(firstSentence('No terminator at all')).toBe('No terminator at all');
  });
});

describe('the three renderings stay inside their hosts’ limits', () => {
  it('the release body carries the census, the grouped changes and the package table', () => {
    const body = renderReleaseBody(release(), OPTIONS);
    expect(body).toMatch(/^# Endora Commerce 0\.2\.0\n/);
    expect(body).toContain('3 packages released (2 minor, 1 dependency-only), carrying 3 changes, 2 of them breaking.');
    expect(body).toContain('/compare/v0.1.0...v0.2.0');
    expect(body).toContain('`release-notes-v0.2.0.md`');
    expect(body.indexOf('## Breaking changes')).toBeLessThan(body.indexOf('## Minor changes'));
    expect(body).not.toContain('## Patch changes');
    expect(body).toContain('| `@endora-commerce/mod-blog` | 0.2.0 | dependencies |');
    expect(body).toContain('| `@endora-commerce/platform` | 0.2.0 | minor |');
    expect(body).not.toContain('Updated dependencies');
  });

  it('a body over the description limit is cut and says where the rest is', () => {
    const long: ReleaseSummary = {
      packages: [],
      changes: Array.from({ length: 400 }, (_, i) => ({
        key: `k${i}`,
        level: 'patch',
        breaking: false,
        headline: 'x',
        lead: 'y'.repeat(400),
        text: '',
        packages: ['@endora-commerce/platform'],
      })),
    };
    const body = renderReleaseBody(long, OPTIONS);
    expect(body.length).toBeLessThanOrEqual(RELEASE_BODY_LIMIT);
    expect(body.trimEnd().endsWith('_Truncated: the full notes are in the attached `release-notes-v0.2.0.md`._')).toBe(true);
  });

  it('the full notes keep every new section, demoted under the package heading', () => {
    const notes = renderFullNotes(release(), OPTIONS);
    expect(notes).toContain('\n## @endora-commerce/platform\n\n### 0.2.0\n\n#### Minor Changes\n');
    expect(notes).toContain('- Updated dependencies [abc1234]');
    expect(notes).not.toContain('## 0.1.0');
  });

  it('the Discord embed links the release, pings nobody and stays under 4096 characters', () => {
    const payload = renderDiscordPayload(release(), OPTIONS);
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    const [embed] = payload.embeds;
    expect(embed?.title).toBe('Endora Commerce 0.2.0');
    expect(embed?.url).toBe('https://github.com/endora-commerce/endora-commerce/releases/tag/v0.2.0');
    expect(embed?.description).toContain('• **Breaking.** `composeApp` no longer registers `legacyFlag`.');
    expect(embed?.description).toContain('Release notes and the full changelog: https://');
    expect(embed?.description.length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_LIMIT);

    const crowded: ReleaseSummary = {
      packages: [],
      changes: Array.from({ length: 60 }, (_, i) => ({
        key: `k${i}`,
        level: 'minor',
        breaking: false,
        headline: `${'word '.repeat(80)}${i}.`,
        lead: '',
        text: '',
        packages: [],
      })),
    };
    const description = renderDiscordPayload(crowded, OPTIONS).embeds[0]!.description;
    expect(description.length).toBeLessThanOrEqual(DISCORD_DESCRIPTION_LIMIT);
    expect(description).toMatch(/… and \d+ more\./);
    expect((description.match(/^• /gm) ?? []).length).toBeLessThanOrEqual(8);
  });
});

describe('the previous tag is the greatest stable one below the release', () => {
  it('orders by version, not by string, and ignores anything that is not vX.Y.Z', () => {
    const tags = ['v0.9.0', 'v0.10.0', 'v0.100.2', 'v0.105.0', 'v0.105.1-rc.1', 'archive/x', 'v1.0.0'];
    expect(previousTagOf('v0.105.0', tags)).toBe('v0.100.2');
    expect(previousTagOf('v0.10.0', tags)).toBe('v0.9.0');
    expect(previousTagOf('v0.9.0', tags)).toBeNull();
    expect(previousTagOf('v0.105.1-rc.1', tags)).toBeNull();
  });
});

describe('end to end on a repository with two tags', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-notes-'));
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, env: gitEnv, encoding: 'utf8' }).trim();
  const write = (path: string, content: string): void => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  git('init', '-q', '-b', 'master');
  write('packages/platform/CHANGELOG.md', PLATFORM_0_1);
  git('add', '-A');
  git('commit', '-q', '-m', 'release 0.1.0');
  git('tag', '-a', 'v0.1.0', '-m', 'Release 0.1.0');
  write('packages/platform/CHANGELOG.md', PLATFORM_0_2);
  write('packages/contracts/CHANGELOG.md', CONTRACTS_0_2);
  write('packages/modules/blog/CHANGELOG.md', BLOG_0_2);
  write('packages/modules/blog/node_modules/dep/CHANGELOG.md', '# dep\n\n## 9.9.9\n\n### Patch Changes\n\n- x\n');
  git('add', '-A', '-f');
  git('commit', '-q', '-m', 'release 0.2.0');
  git('tag', '-a', 'v0.2.0', '-m', 'Release 0.2.0');
  write('README.md', 'no changelog moved\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'docs');
  git('tag', '-a', 'v0.2.1', '-m', 'Release 0.2.1');

  it('writes the three files for a tag whose changelogs gained sections', () => {
    const out = join(root, 'out-0.2.0');
    expect(main(['v0.2.0', '--out', out], root)).toBe(0);
    expect(existsSync(join(out, 'release-body.md'))).toBe(true);
    expect(existsSync(join(out, 'release-notes-v0.2.0.md'))).toBe(true);
    const payload = JSON.parse(readFileSync(join(out, 'discord.json'), 'utf8')) as {
      embeds: { title: string; description: string }[];
    };
    expect(payload.embeds[0]?.title).toBe('Endora Commerce 0.2.0');
    expect(payload.embeds[0]?.description).toContain('3 packages released');
    const body = readFileSync(join(out, 'release-body.md'), 'utf8');
    expect(body).toContain('/compare/v0.1.0...v0.2.0');
    // The changelog planted under node_modules is not a package of the release.
    expect(body).not.toContain('| `dep` |');
  });

  it('refuses a tag on a commit whose changelogs gained nothing, and writes nothing', () => {
    const out = join(root, 'out-0.2.1');
    expect(main(['v0.2.1', '--out', out], root)).toBe(2);
    expect(existsSync(out)).toBe(false);
  });

  it('with no previous tag every section is new, and the body says so without a compare link', () => {
    const out = join(root, 'out-none');
    expect(main(['v0.2.0', '--out', out, '--previous', 'none'], root)).toBe(0);
    const body = readFileSync(join(out, 'release-body.md'), 'utf8');
    expect(body).not.toContain('/compare/');
    expect(readFileSync(join(out, 'release-notes-v0.2.0.md'), 'utf8')).toContain('### 0.1.0');
  });

  it('refuses a tag that is not a stable release, a tag it cannot see, and a bad command line', () => {
    expect(main(['v0.2.1-rc.1', '--out', join(root, 'x')], root)).toBe(2);
    expect(main(['v9.9.9', '--out', join(root, 'x')], root)).toBe(2);
    expect(main(['v0.2.0'], root)).toBe(1);
    expect(main(['--out', join(root, 'x')], root)).toBe(1);
  });
});
