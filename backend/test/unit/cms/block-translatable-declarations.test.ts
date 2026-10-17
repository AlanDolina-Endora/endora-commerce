import { describe, expect, it } from 'vitest';
import type { BlockDefinition } from '@endora-commerce/contracts';
import { REGISTERED_MANIFESTS } from '../../../src/lifecycle/registered-manifests.js';

/**
 * Feature 151, T021 (`contracts/block-translatable-declaration.md` §1) — every
 * first-party block offered in the CMS palette says which of its props are
 * prose. An undeclared block is never sent to a model, so a block that forgot
 * its declaration would silently stay untranslated; this is what makes that a
 * build failure for the blocks this repository ships.
 *
 * Iterates the composed manifests rather than a hand list, so a new
 * CMS-context block in any module is held to it on the day it lands.
 */

const FORBIDDEN_LEAF = /^(editorName|href|url|src|code|script|html|id|.*Href|.*Slug|.*AssetId|.*Url|.*Color)$/;

const cmsBlocks = REGISTERED_MANIFESTS.flatMap((entry) =>
  ((entry.manifest.blocks ?? []) as BlockDefinition[])
    .filter((block) => block.contexts.includes('cms'))
    .map((block) => ({ module: entry.manifest.id, block })),
);

describe('CMS-context block translatable declarations', () => {
  it('reads a population', () => {
    expect(cmsBlocks.length).toBeGreaterThan(30);
  });

  it.each(cmsBlocks.map(({ module, block }) => [block.name, module, block] as const))(
    '%s (%s) declares translatable',
    (_name, _module, block) => {
      expect(block.translatable, `${block.name} has no translatable declaration`).toBeDefined();
    },
  );

  it('never declares a link, a code, a reference, a colour or an editor-only name', () => {
    const offending = cmsBlocks.flatMap(({ block }) =>
      (block.translatable ?? [])
        .filter((entry) => FORBIDDEN_LEAF.test(entry.path.split('.').at(-1)!.replace('[]', '')))
        .map((entry) => `${block.name}:${entry.path}`),
    );
    expect(offending).toEqual([]);
  });
});
