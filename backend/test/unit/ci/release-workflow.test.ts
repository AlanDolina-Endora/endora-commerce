import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readWorkflowJobs } from '../../helpers/actions-workflows.js';

/**
 * The release page and the Discord post (`specs/conventions/release-intent.md`
 * § *The release page and the Discord post*).
 *
 * The workflow is keyed on the pushed `vX.Y.Z` tag and on nothing earlier,
 * does both things in one job because a `GITHUB_TOKEN` release starts no
 * workflow, and fails closed where the script does. Each assertion below
 * holds one of those properties against the file as written; the parser is
 * `test/helpers/actions-workflows.ts`, the one every other workflow test
 * reads through.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WORKFLOW = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
const SCRIPT = readFileSync(join(REPO_ROOT, 'backend/scripts/release-notes.ts'), 'utf8');
const CONVENTION = readFileSync(join(REPO_ROOT, 'specs/conventions/release-intent.md'), 'utf8');

const CONFIGURATION = WORKFLOW.split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');
const JOBS = readWorkflowJobs(WORKFLOW);
const RUN = JOBS.flatMap((job) => job.runLines);
/** The job's block without its comment lines. */
const JOB = JOBS[0]!.body
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');
/** The `on:` block alone: the lines from `on:` to the next top-level key. */
const TRIGGERS = /^on:\n((?:[ \t]+.*\n|\n)*)/m.exec(CONFIGURATION)?.[1] ?? '';

describe('the release workflow is one job keyed on the release tag', () => {
  it('parses one job, named for the status it reports', () => {
    expect(JOBS.map((job) => job.name)).toEqual(['release:github']);
    expect(RUN.length).toBeGreaterThan(3);
  });

  it('starts on a pushed stable tag and on nothing else', () => {
    expect(TRIGGERS).toMatch(/^  push:\n    tags:\n      - 'v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'\n/);
    // One trigger, one filter: no branches, no `release:` event, no dispatch.
    expect(TRIGGERS.split('\n').filter((line) => /^  \S/.test(line))).toEqual(['  push:']);
    expect(TRIGGERS).not.toMatch(/^\s+branches:/m);
  });

  it('writes contents in the job only, and never holds the publish token', () => {
    expect(CONFIGURATION).toMatch(/^permissions:\n  contents: read\n/m);
    expect(JOB).toMatch(/^    permissions:\n      contents: write\n    [a-z]/m);
    expect(CONFIGURATION).not.toContain('id-token');
    expect(CONFIGURATION).not.toContain('ENDORA_NPM_TOKEN');
  });

  it('fetches the whole history and the tags, and installs nothing', () => {
    expect(JOBS[0]!.uses).toEqual(['actions/checkout@v7', 'actions/setup-node@v7']);
    expect(JOB).toMatch(/fetch-depth: 0\n\s+fetch-tags: true/);
    expect(RUN.some((line) => /pnpm (install|run build)/.test(line))).toBe(false);
  });

  it('assembles, refuses a second release, creates, then announces — in that order', () => {
    const at = (pattern: RegExp): number => RUN.findIndex((line) => pattern.test(line));
    const assemble = at(/^node backend\/scripts\/release-notes\.ts "\$TAG" --out release-notes --repo-url "\$REPO_URL"$/);
    const guard = at(/^if gh release view "\$TAG"/);
    const create = at(/^gh release create "\$TAG"/);
    const announce = at(/^curl /);
    expect([assemble, guard, create, announce].every((index) => index >= 0)).toBe(true);
    expect(assemble).toBeLessThan(guard);
    expect(guard).toBeLessThan(create);
    expect(create).toBeLessThan(announce);
    const creation = RUN.slice(create, announce).join(' ');
    expect(creation).toContain('--verify-tag');
    expect(creation).toContain('--notes-file release-notes/release-body.md');
    expect(creation).toContain('"release-notes/release-notes-$TAG.md"');
    expect(RUN.slice(announce).join(' ')).toContain('--data @release-notes/discord.json');
    expect(RUN.slice(announce).join(' ')).toContain('--fail-with-body');
  });

  it('reads the webhook as a step secret, once, and treats its absence as a warning', () => {
    expect(CONFIGURATION.match(/secrets\.DISCORD_WEBHOOK_URL/g)).toHaveLength(1);
    expect(CONFIGURATION).not.toMatch(/vars\.DISCORD_WEBHOOK_URL/);
    expect(JOB).toMatch(/^        env:\n\s+DISCORD_WEBHOOK_URL: \$\{\{ secrets\.DISCORD_WEBHOOK_URL \}\}/m);
    expect(RUN.some((line) => line.startsWith('if [ -z "$DISCORD_WEBHOOK_URL" ]'))).toBe(true);
    expect(RUN.some((line) => line.includes('::warning::'))).toBe(true);
  });

  it('the script, the workflow and the convention point at one another', () => {
    const section = 'The release page and the Discord post';
    expect(WORKFLOW).toContain(`specs/conventions/release-intent.md\` § *${section}*`);
    expect(SCRIPT).toContain(section);
    expect(CONVENTION).toContain(`**${section} are keyed on that tag`);
    expect(CONVENTION).toContain('.github/workflows/release.yml');
    expect(CONVENTION).toContain('backend/scripts/release-notes.ts');
    expect(CONVENTION).toContain('backend/test/unit/ci/release-workflow.test.ts');
  });
});
