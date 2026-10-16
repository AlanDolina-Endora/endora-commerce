import {
  ADMIN_SEARCH_MAX_FIELDS,
  AdminSearchEntityTypeSchema,
  AdminSearchFieldCodeSchema,
  AdminSearchLabelKeySchema,
  KnownIconNameSchema,
  type AdminSearchProvider,
  type AdminSearchProviderRegistryPort,
  type PermissionRequirement,
} from '@endora-commerce/contracts';

const WILDCARD_PERMISSION = '*';

/** Answers whether a module is effectively present (both axes, Principle XVII). */
export type ModulePresenceProbe = (moduleId: string) => boolean;

/**
 * The record types owning modules contribute to global search
 * (`specs/150-admin-global-search/contracts/provider-contract.md`).
 *
 * A **contribution registry**: owners push from a contribution-only boot hook,
 * whatever this module's effective state is, and the presence question is
 * answered here **at enumeration**, keyed on the module recorded with each
 * provider — so switching a provider's module off or on takes effect on the
 * next request, with no restart (module-activation.md, boot-hook split rule).
 *
 * The probe defaults to always-present so a unit test that builds its own
 * registry keeps answering about the providers it registered; the module's
 * composition wires it to the kernel's `effectiveState`.
 */
export class AdminSearchProviderRegistry implements AdminSearchProviderRegistryPort {
  readonly #providers = new Map<string, AdminSearchProvider>();

  constructor(private readonly isPresent: ModulePresenceProbe = () => true) {}

  register(provider: AdminSearchProvider): void {
    const problem = describeInvalidProvider(provider);
    if (problem !== null) {
      throw new Error(
        `admin_search: module '${provider.moduleId}' contributed an invalid search provider '${provider.entityType}': ${problem}`,
      );
    }
    if (this.#providers.has(provider.entityType)) {
      throw new Error(
        `admin_search: module '${provider.moduleId}' contributed search provider '${provider.entityType}', which is already registered`,
      );
    }
    this.#providers.set(provider.entityType, provider);
  }

  /** Every registered provider, in group order, whatever its module's presence. */
  all(): AdminSearchProvider[] {
    return [...this.#providers.values()].sort(byGroupOrder);
  }

  /** Providers whose module is effectively present, in group order — what configuration lists. */
  listPresent(): AdminSearchProvider[] {
    return this.all().filter((p) => this.isPresent(p.moduleId));
  }

  /** Present providers the caller may read, in group order — what a search runs. */
  listVisible(permissions: readonly string[]): AdminSearchProvider[] {
    const held = new Set(permissions);
    // `*` is a role's "full access" (`admin_roles`, `PermissionService.hasPermission`).
    if (held.has(WILDCARD_PERMISSION)) return this.listPresent();
    return this.listPresent().filter((p) => satisfies(p.requiredPermission, held));
  }
}

function byGroupOrder(a: AdminSearchProvider, b: AdminSearchProvider): number {
  return a.weight - b.weight || a.entityType.localeCompare(b.entityType);
}

function satisfies(requirement: PermissionRequirement, held: ReadonlySet<string>): boolean {
  return typeof requirement === 'string'
    ? held.has(requirement)
    : requirement.some((code) => held.has(code));
}

/** The registry invariants (data-model.md §4); `null` when the provider is well-formed. */
function describeInvalidProvider(provider: AdminSearchProvider): string | null {
  if (!AdminSearchEntityTypeSchema.safeParse(provider.entityType).success) {
    return 'the entity type must be <moduleId>.<snake_name>';
  }
  if (!provider.entityType.startsWith(`${provider.moduleId}.`)) {
    return `the entity type must start with '${provider.moduleId}.'`;
  }
  if (!AdminSearchLabelKeySchema.safeParse(provider.labelKey).success) {
    return `the label key '${provider.labelKey}' is not a module-relative translation key`;
  }
  if (!KnownIconNameSchema.safeParse(provider.icon).success) {
    return `the icon '${provider.icon}' is not a known icon name`;
  }
  if (provider.fields.length === 0 || provider.fields.length > ADMIN_SEARCH_MAX_FIELDS) {
    return `a provider offers 1 to ${ADMIN_SEARCH_MAX_FIELDS} fields`;
  }
  const codes = new Set<string>();
  for (const field of provider.fields) {
    if (!AdminSearchFieldCodeSchema.safeParse(field.code).success) {
      return `the field code '${field.code}' must be camelCase`;
    }
    if (codes.has(field.code)) return `the field code '${field.code}' is offered twice`;
    codes.add(field.code);
    if (!AdminSearchLabelKeySchema.safeParse(field.labelKey).success) {
      return `the label key '${field.labelKey}' is not a module-relative translation key`;
    }
  }
  if (!provider.fields.some((field) => field.defaultSelected)) {
    return 'at least one field must be selected by default';
  }
  return null;
}
