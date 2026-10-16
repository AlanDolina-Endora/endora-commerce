import type { ApplicationRule } from '@endora-commerce/contracts';

/**
 * Feature 050 — price lists are rule-scoped: their organization targeting lives
 * in the application-rule AST, not in a column. Collect the organization ids a
 * rule targets so a scoped admin only sees lists targeting one of their
 * organizations (or global lists).
 *
 * Shared by the list routes and the price matrix service (feature 148), whose
 * every route first applies the parent list's visibility.
 */
export function extractRuleOrgTargets(rule: ApplicationRule | null | undefined): string[] {
  if (!rule) return [];
  switch (rule.kind) {
    case 'all':
      return [];
    case 'criterion':
      return rule.type === 'organization' ? [...rule.values] : [];
    case 'group':
      return rule.children.flatMap(extractRuleOrgTargets);
  }
}
