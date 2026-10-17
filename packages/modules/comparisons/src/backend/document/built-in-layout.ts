import type { DocumentTemplateContent } from '@endora-commerce/contracts';

/**
 * The comparison PDF's built-in layout — today's fixed layout (title, the
 * display-mode caption, a table of image, name and price per product) as a
 * Page Builder tree, in every language the platform ships (owner Q5, FR-064).
 *
 * The printed texts of both languages live here, in **one** per-language map,
 * which is the only place Polish prose sits in this module's code
 * (Constitution VIII: user-facing strings ship in both languages).
 */

interface LayoutTexts {
  readonly title: string;
  readonly dateLabel: string;
  readonly modeLabelAll: string;
  readonly modeLabelCommon: string;
  readonly modeLabelDifferences: string;
  readonly pricedForOrganizationText: string;
  readonly pricedForChannelText: string;
  readonly attributeColumnLabel: string;
  readonly availableText: string;
  readonly unavailableText: string;
  readonly hiddenNoteText: string;
  readonly shareLabel: string;
}

export const BUILT_IN_TEXTS: Readonly<Record<'en-US' | 'pl-PL', LayoutTexts>> = {
  'en-US': {
    title: 'Product comparison',
    dateLabel: 'Date:',
    modeLabelAll: 'All attributes',
    modeLabelCommon: 'Common attributes only',
    modeLabelDifferences: 'Differences only',
    pricedForOrganizationText: 'Prices for your organisation.',
    pricedForChannelText: 'Catalogue prices.',
    attributeColumnLabel: 'Attribute',
    availableText: 'Available',
    unavailableText: 'Unavailable',
    hiddenNoteText: '{{hiddenCount}} product(s) of this comparison are not available to you.',
    shareLabel: 'View this comparison online:',
  },
  'pl-PL': {
    title: 'Porównanie produktów',
    dateLabel: 'Data:',
    modeLabelAll: 'Wszystkie atrybuty',
    modeLabelCommon: 'Tylko wspólne atrybuty',
    modeLabelDifferences: 'Tylko różnice',
    pricedForOrganizationText: 'Ceny dla Twojej organizacji.',
    pricedForChannelText: 'Ceny katalogowe.',
    attributeColumnLabel: 'Atrybut',
    availableText: 'Dostępny',
    unavailableText: 'Niedostępny',
    hiddenNoteText: 'Liczba produktów z tego porównania niedostępnych dla Ciebie: {{hiddenCount}}.',
    shareLabel: 'Zobacz to porównanie online:',
  },
};

function treeFor(texts: LayoutTexts) {
  return {
    root: { props: {} },
    content: [
      {
        type: 'comparisons.ComparisonHeader',
        props: {
          id: 'comparison-header',
          title: texts.title,
          showDate: true,
          dateLabel: texts.dateLabel,
          showDisplayMode: true,
          modeLabelAll: texts.modeLabelAll,
          modeLabelCommon: texts.modeLabelCommon,
          modeLabelDifferences: texts.modeLabelDifferences,
          showPricedFor: true,
          pricedForOrganizationText: texts.pricedForOrganizationText,
          pricedForChannelText: texts.pricedForChannelText,
        },
      },
      {
        type: 'comparisons.ComparisonTable',
        props: {
          id: 'comparison-table',
          showImages: true,
          showName: true,
          showSku: false,
          showPrice: true,
          showAvailability: false,
          availableText: texts.availableText,
          unavailableText: texts.unavailableText,
          attributeColumnLabel: texts.attributeColumnLabel,
          showHiddenNote: true,
          hiddenNoteText: texts.hiddenNoteText,
        },
      },
    ],
  };
}

/** A fresh envelope per call: callers may mutate what they get. */
export function comparisonBuiltInLayout(): DocumentTemplateContent {
  return {
    schemaVersion: 1,
    languages: {
      'en-US': treeFor(BUILT_IN_TEXTS['en-US']),
      'pl-PL': treeFor(BUILT_IN_TEXTS['pl-PL']),
    },
  } as DocumentTemplateContent;
}
