import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * The root layout and robots (`specs/144-seo-search-engine-robots/`, FR-035).
 *
 * Next's metadata **replaces** `robots` between a layout and a page; it does
 * not merge. Measured on a built storefront: with
 * `robots: { index: false, follow: false, noarchive: true }` on the root
 * layout, `/` served `noindex, nofollow, noarchive` and `/cart`, which declares
 * its own, served `noindex, nofollow` — the layout's value was gone.
 *
 * So a channel default put into the layout's `metadata` would be silently
 * dropped on every route that declares `robots` for itself, and would become a
 * second author of the one tag `check:storefront-indexability` reads. The
 * layout therefore renders its own `<meta name="robots">` element, outside the
 * metadata API, where no page can replace it — and this file holds both halves.
 *
 * It reads the source rather than rendering the layout, as
 * `route-declarations.test.ts`' neighbours do: rendering it would need the
 * dictionary, the megamenu, the cart and six analytics configs.
 */

const LAYOUT = fileURLToPath(new URL('../../app/layout.tsx', import.meta.url));
const source = ts.createSourceFile(
  LAYOUT,
  readFileSync(LAYOUT, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Every top-level `export const <name>` and `export function <name>` in the layout. */
function exportedNames(): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        names.push(declaration.name.getText(source));
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
    }
  }
  return names;
}

/** The object literal `export const metadata` is initialised with. */
function metadataLiteral(): ts.ObjectLiteralExpression {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(source) !== 'metadata') continue;
      if (declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
        return declaration.initializer;
      }
    }
  }
  throw new Error('app/layout.tsx no longer exports a `metadata` object literal');
}

/** JSX elements named `tag`, opening or self-closing. */
function jsxElements(tag: string): (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] {
  const found: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
  walk(source, (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === tag
    ) {
      found.push(node);
    }
  });
  return found;
}

describe('the root layout declares no robots through the metadata API', () => {
  it('has a static metadata object with no robots member', () => {
    const members = metadataLiteral().properties.map((property) =>
      property.name ? property.name.getText(source) : property.getText(source),
    );
    expect(members).not.toContain('robots');
    // A spread could bring one in unseen; the layout's metadata has none.
    expect(metadataLiteral().properties.some(ts.isSpreadAssignment)).toBe(false);
  });

  it('exports no generateMetadata that could compute one', () => {
    expect(exportedNames()).toContain('metadata');
    expect(exportedNames()).not.toContain('generateMetadata');
  });
});

describe('the root layout renders the channel default as its own element', () => {
  const robotsMetas = jsxElements('meta').filter((element) =>
    element.attributes.properties.some(
      (attribute) =>
        ts.isJsxAttribute(attribute) &&
        attribute.name.getText(source) === 'name' &&
        attribute.initializer !== undefined &&
        ts.isStringLiteral(attribute.initializer) &&
        attribute.initializer.text === 'robots',
    ),
  );

  it('in every document it returns, the outage shell included', () => {
    // Two `<StorefrontDocument>`s: the backend-unreachable shell and the shop.
    // A channel that is `noindex` is `noindex` on its `503` page as well.
    const documents = jsxElements('StorefrontDocument');
    expect(documents.length).toBeGreaterThanOrEqual(2);
    expect(robotsMetas).toHaveLength(documents.length);
  });

  it('with content that is the validated header value and never a literal', () => {
    for (const element of robotsMetas) {
      const content = element.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'content',
      );
      expect(content?.initializer && ts.isJsxExpression(content.initializer)).toBe(true);
    }
    const text = source.getFullText();
    expect(text).toContain('robotsDirectiveFromHeader(');
    expect(text).toContain('ROBOTS_DEFAULT_REQUEST_HEADER');
  });
});
