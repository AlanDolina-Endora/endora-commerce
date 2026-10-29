/**
 * Command-palette coverage of the admin surfaces modules contribute
 * (Principle XVI; issue #510).
 *
 * The rule, its escape hatch and its debt ledger are stated once, in
 * `specs/conventions/module-admin-surfaces.md` § *Command palette*, item 7.
 * This file is the derivation: it takes the declarations as data, so the red
 * proofs in `admin/test/unit/palette-coverage.test.ts` enter at the top of the
 * analysis, exactly where the real registry and the real manifests enter.
 *
 * A **destination** is a static admin path a module contributes as a route, or
 * as the `to` of one of its sidebar entries. A path with a `:param` or a `*`
 * segment is a detail or catch-all screen and is never a destination: a palette
 * action cannot target it (`ModuleActionSchema`'s route regex refuses both
 * characters), and it is reached from its parent list.
 *
 * A destination is **covered** when some manifest action — any module's, the
 * palette is one list — declares it as its `targetRoute`. Which code that action
 * must carry is `check:action-route-permissions`' question and is deliberately
 * not asked again here.
 *
 * Three classes of destination, three treatments:
 *  - a **landing** route (`index: true`) must be covered, without exception —
 *    that is Principle XVI itself;
 *  - a **sidebar** destination must be covered — a sidebar entry is top-level
 *    by definition, and "sidebar-only is not enough". The only way past is the
 *    debt ledger, which holds the gaps that predate this rule and only shrinks;
 *  - **any other** static route must be covered or carry an exemption, with a
 *    reason, saying why it is not a top-level screen.
 */

/** The parts of a contributed route the rule reads. */
export interface CoverageRoute {
  readonly path: string;
  readonly index?: boolean | undefined;
}

/** The parts of a contributed sidebar entry the rule reads. */
export interface CoverageNav {
  readonly to: string;
}

/** One module's admin surface: what `MODULE_ADMIN_CONTRIBUTIONS` carries. */
export interface CoverageSurface {
  readonly moduleId: string;
  readonly routes: readonly CoverageRoute[];
  readonly nav: readonly CoverageNav[];
}

/** The parts of a manifest action the rule reads. */
export interface CoverageAction {
  readonly moduleId: string;
  readonly id: string;
  readonly targetRoute: string;
}

/** `<moduleId>` → `<path>` → the reason, in words a reviewer can disagree with. */
export type PaletteLedger = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type PaletteCoverageFindingKind =
  | 'uncovered-landing'
  | 'uncovered-sidebar-entry'
  | 'uncovered-destination'
  | 'stale-exemption'
  | 'stale-debt'
  | 'entry-without-reason';

export interface PaletteCoverageFinding {
  readonly kind: PaletteCoverageFindingKind;
  readonly moduleId: string;
  readonly path: string;
}

/** A path a palette action could target: no parameter, no wildcard. */
export function isStaticAdminPath(path: string): boolean {
  return !path.split('/').some((segment) => segment.startsWith(':') || segment.includes('*'));
}

/** The minimum length a reason must have to say something. */
const MIN_REASON_LENGTH = 20;

type DestinationClass = 'landing' | 'sidebar' | 'other';

export function paletteCoverageFindings(input: {
  readonly surfaces: readonly CoverageSurface[];
  readonly actions: readonly CoverageAction[];
  /** Static, non-sidebar, non-landing routes that are deliberately not palette targets. */
  readonly exemptions: PaletteLedger;
  /** Sidebar destinations that predate the rule and have no action yet. Only shrinks. */
  readonly debt: PaletteLedger;
}): PaletteCoverageFinding[] {
  const findings: PaletteCoverageFinding[] = [];
  const covered = new Set(input.actions.map((action) => action.targetRoute));
  const usedExemptions = new Set<string>();
  const usedDebt = new Set<string>();
  const key = (moduleId: string, path: string): string => `${moduleId} ${path}`;

  for (const surface of input.surfaces) {
    const destinations = new Map<string, DestinationClass>();
    for (const route of surface.routes) {
      if (!isStaticAdminPath(route.path)) continue;
      destinations.set(route.path, route.index === true ? 'landing' : 'other');
    }
    for (const entry of surface.nav) {
      if (!isStaticAdminPath(entry.to)) continue;
      if (destinations.get(entry.to) !== 'landing') destinations.set(entry.to, 'sidebar');
    }

    for (const [path, destinationClass] of destinations) {
      if (covered.has(path)) continue;
      if (destinationClass === 'other' && input.exemptions[surface.moduleId]?.[path] !== undefined) {
        usedExemptions.add(key(surface.moduleId, path));
        continue;
      }
      if (destinationClass === 'sidebar' && input.debt[surface.moduleId]?.[path] !== undefined) {
        usedDebt.add(key(surface.moduleId, path));
        continue;
      }
      findings.push({
        kind:
          destinationClass === 'landing'
            ? 'uncovered-landing'
            : destinationClass === 'sidebar'
              ? 'uncovered-sidebar-entry'
              : 'uncovered-destination',
        moduleId: surface.moduleId,
        path,
      });
    }
  }

  const sweep = (ledger: PaletteLedger, used: Set<string>, staleKind: PaletteCoverageFindingKind): void => {
    for (const [moduleId, entries] of Object.entries(ledger)) {
      for (const [path, reason] of Object.entries(entries)) {
        if (reason.trim().length < MIN_REASON_LENGTH) {
          findings.push({ kind: 'entry-without-reason', moduleId, path });
        }
        if (!used.has(key(moduleId, path))) findings.push({ kind: staleKind, moduleId, path });
      }
    }
  };
  sweep(input.exemptions, usedExemptions, 'stale-exemption');
  sweep(input.debt, usedDebt, 'stale-debt');

  return findings;
}

/** One line per finding, in the words a reader can act on. */
export function describeFinding(finding: PaletteCoverageFinding): string {
  const { moduleId, path } = finding;
  switch (finding.kind) {
    case 'uncovered-landing':
      return `${moduleId}: landing route ${path} has no palette action (no exemption possible)`;
    case 'uncovered-sidebar-entry':
      return `${moduleId}: sidebar entry ${path} has no palette action (no exemption possible)`;
    case 'uncovered-destination':
      return `${moduleId}: ${path} has no palette action — declare one, or exempt it with a reason`;
    case 'stale-exemption':
      return `${moduleId}: exemption for ${path} no longer matches an uncovered non-sidebar route — delete it`;
    case 'stale-debt':
      return `${moduleId}: debt entry for ${path} no longer matches an uncovered sidebar entry — delete it`;
    case 'entry-without-reason':
      return `${moduleId}: ledger entry for ${path} states no reason`;
  }
}
