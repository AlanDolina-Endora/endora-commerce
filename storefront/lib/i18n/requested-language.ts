/**
 * The language a link asked for (`?lang=<L>`): a non-default language travels
 * with every product URL (feature 163, FR-071) and every CMS page URL (R24) the
 * platform emits. Only a well-formed BCP-47 tag is passed on; the backend
 * resolves it against the channel's languages.
 */
export function requestedLanguage(lang: string | string[] | undefined): string | null {
  return typeof lang === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(lang) ? lang : null;
}
