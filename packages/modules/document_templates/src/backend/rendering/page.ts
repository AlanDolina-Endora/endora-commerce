import {
  GENERIC_DOCUMENT_PAGE_DEFAULTS,
  documentRootPropsSchema,
  type DocumentPageDefaults,
  type ResolvedDocumentRootProps,
} from '@endora-commerce/contracts';

/** Page dimensions in points, portrait. */
const PAGE_SIZES: Record<ResolvedDocumentRootProps['pageSize'], { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

/**
 * The root props a render uses: the generic defaults, under the type's
 * `pageDefaults`, under the stored root props — each stored key kept only when
 * it is valid on its own, so one bad value costs that value and not the page.
 */
export function resolveRootProps(
  stored: unknown,
  pageDefaults: DocumentPageDefaults | undefined,
): ResolvedDocumentRootProps {
  const { styles: _styles, ...typeDefaults } = pageDefaults ?? {};
  const merged: Record<string, unknown> = { ...GENERIC_DOCUMENT_PAGE_DEFAULTS, ...typeDefaults };
  const shape = documentRootPropsSchema.shape as Record<string, { safeParse(value: unknown): { success: boolean } }>;
  if (stored && typeof stored === 'object') {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      const field = shape[key];
      if (field && value !== undefined && field.safeParse(value).success) merged[key] = value;
    }
  }
  return merged as unknown as ResolvedDocumentRootProps;
}

/** Usable width in points after orientation and the side margins. */
export function usableWidth(root: ResolvedDocumentRootProps, orientation: 'portrait' | 'landscape'): number {
  const size = PAGE_SIZES[root.pageSize];
  const width = orientation === 'landscape' ? size.height : size.width;
  return Math.max(72, width - root.marginLeft - root.marginRight);
}
