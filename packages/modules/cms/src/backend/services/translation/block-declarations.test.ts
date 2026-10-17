import { describe, expect, it } from 'vitest';
import type { BlockDefinition, BlockTranslatableText } from '@endora-commerce/contracts';
import { manifest } from '../../../manifest.js';
import { extract } from './extract.js';

/**
 * Feature 151, T021/T022 — per `cms.*` block, a node carrying every prop of its
 * `@endora-commerce/cms-components` type with a recognisable value yields
 * exactly the planned prose (`data-model.md` §2) and never a link, a code, an
 * asset reference or an editor-only name.
 */

const blocks = new Map(
  ((manifest.blocks ?? []) as BlockDefinition[]).map((block) => [block.name, block.translatable]),
);
const declarations = (name: string): readonly BlockTranslatableText[] | undefined => blocks.get(name);

const P = (label: string) => `Prose ${label}`;
const X = (label: string) => `NOPE ${label}`;
const tiptap = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const box = { margin: X('margin'), padding: X('padding'), editorName: X('editorName'), id: 'n' };

const FIXTURES: Record<string, { props: Record<string, unknown>; expected: string[] }> = {
  'cms.Heading': { props: { ...box, text: P('heading'), level: 2, color: X('color') }, expected: [P('heading')] },
  'cms.Text': {
    props: { ...box, text: P('text'), tiptapContent: tiptap(P('tiptap')), html: X('html') },
    expected: [P('text'), P('tiptap')],
  },
  'cms.RichContent': { props: { ...box, content: tiptap(P('rich')), html: X('html') }, expected: [P('rich')] },
  'cms.Button': {
    props: { ...box, label: P('label'), href: X('href'), linkSlug: X('slug'), backgroundColor: X('bg') },
    expected: [P('label')],
  },
  'cms.Image': { props: { ...box, src: X('src'), assetId: X('asset'), alt: P('alt'), href: X('href') }, expected: [P('alt')] },
  'cms.Icons': { props: { ...box, name: X('icon'), href: X('href') }, expected: [] },
  'cms.Social': {
    props: { ...box, items: [{ network: X('net'), label: P('social'), url: X('url') }] },
    expected: [P('social')],
  },
  'cms.FeatureList': {
    props: { ...box, items: [{ icon: X('icon'), title: P('title'), description: P('description') }] },
    expected: [P('title'), P('description')],
  },
  'cms.Hero': {
    props: {
      ...box,
      heading: P('heading'),
      subtitle: P('subtitle'),
      buttonLabel: P('button'),
      buttonHref: X('href'),
      buttonLinkSlug: X('slug'),
      textColor: X('color'),
    },
    expected: [P('heading'), P('subtitle'), P('button')],
  },
  'cms.LogoStrip': {
    props: { ...box, items: [{ src: X('src'), assetId: X('asset'), alt: P('alt'), href: X('href') }] },
    expected: [P('alt')],
  },
  'cms.Testimonial': {
    props: { ...box, quote: P('quote'), author: P('author'), role: P('role'), avatarUrl: X('avatar'), avatarAssetId: X('a') },
    expected: [P('quote'), P('author'), P('role')],
  },
  'cms.Stats': {
    props: { ...box, items: [{ value: P('value'), label: P('label') }], valueColor: X('color') },
    expected: [P('value'), P('label')],
  },
  'cms.AnnouncementBar': { props: { text: P('text'), href: X('href'), editorName: X('n') }, expected: [P('text')] },
  'cms.SimpleTable': {
    props: {
      ...box,
      columns: [{ label: P('column') }],
      tableRows: [{ cells: [{ value: P('cell') }] }],
      headers: [{ label: P('header') }],
      rows: [{ cells: [{ value: P('row') }] }],
    },
    expected: [P('column'), P('cell'), P('header'), P('row')],
  },
  'cms.Video': { props: { ...box, url: X('url'), title: P('title') }, expected: [P('title')] },
  'cms.Map': {
    props: { ...box, googleApiKey: X('key'), markers: [{ lat: 1, lng: 2, label: P('marker'), link: X('link') }] },
    expected: [P('marker')],
  },
  'cms.ImageSlider': {
    props: { ...box, items: [{ src: X('src'), assetId: X('a'), title: P('slide'), titleColor: X('c') }] },
    expected: [P('slide')],
  },
  'cms.Tabs': {
    props: { ...box, items: [{ label: P('tab'), content: `<p>${P('tab content')}</p>` }] },
    expected: [P('tab'), `<0/>${P('tab content')}<1/>`],
  },
  'cms.Accordion': {
    props: { ...box, items: [{ title: P('accordion'), content: `<p>${P('accordion content')}</p>` }] },
    expected: [P('accordion'), `<0/>${P('accordion content')}<1/>`],
  },
  'cms.NewsletterSignup': {
    props: {
      ...box,
      heading: P('heading'),
      description: P('description'),
      placeholder: P('placeholder'),
      buttonLabel: P('button'),
      actionUrl: X('url'),
    },
    expected: [P('heading'), P('description'), P('placeholder'), P('button')],
  },
  'cms.ContactFormEmbed': {
    props: { ...box, heading: P('heading'), description: P('description'), embedUrl: X('url'), mailto: X('mail') },
    expected: [P('heading'), P('description')],
  },
  'cms.RawHtml': { props: { ...box, html: X('html') }, expected: [] },
  'cms.RawJs': { props: { ...box, script: X('script') }, expected: [] },
  'cms.InsertBlock': { props: { code: X('code'), editorName: X('n') }, expected: [] },
  'cms.InsertTemplate': { props: { code: X('code'), editorName: X('n') }, expected: [] },
  'cms.Row': { props: { ...box, content: [] }, expected: [] },
  'cms.Column': { props: { ...box, content: [] }, expected: [] },
  'cms.Spacer': { props: { editorName: X('n'), dividerColor: X('c') }, expected: [] },
  'cms.ContentSlider': { props: { ...box, slides: [] }, expected: [] },
  'cms.Slide': { props: { ...box, content: [] }, expected: [] },
};

describe('cms block declarations', () => {
  it('cover every block this module declares', () => {
    expect([...blocks.keys()].sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it.each(Object.entries(FIXTURES))('%s yields exactly its prose', (name, fixture) => {
    const data = { root: { props: {} }, content: [{ type: name, props: fixture.props }] };
    const extraction = extract(data, declarations);
    const texts = extraction.segments.map((segment) => segment.text);
    expect(texts).toEqual(fixture.expected);
    expect(texts.join('\n')).not.toContain('NOPE');
    expect([...extraction.untranslatableBlocks]).toEqual([]);
  });
});
