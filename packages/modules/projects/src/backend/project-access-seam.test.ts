import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PROJECT_ACCESS_READERS } from './services/project-access.js';

/**
 * The `ProjectAccess` seam (`specs/163-projects-and-tasks/research.md` R-2).
 *
 * Every Project-owned entity is `@RuleScoped`, and **no ORM filter backs that
 * class**: a forgotten `em.findOne(Project, id)` would hand any `projects:read`
 * holder a Project out of their Organization reach or visibility, and no other
 * test would notice until the route that does it is covered by a cross-tenant
 * case. This file is the guard against the forgotten path: it parses every
 * source under `routes/` and `services/` and fails on any read of a
 * `@RuleScoped` table outside `services/project-access.ts` and the files that
 * file allow-lists, each with its reason, in `PROJECT_ACCESS_READERS`.
 *
 * A read is an entity-manager call naming a rule-scoped class (`find`,
 * `findOne`, `findOneOrFail`, `findAndCount`, `findAll`, `count`,
 * `getReference`, `getRepository`), or SQL text selecting or joining a
 * rule-scoped table. The rule-scoped set is derived from the entity
 * declarations, never written down.
 */

const BACKEND = dirname(fileURLToPath(import.meta.url));
const ACCESS_FILE = 'services/project-access.ts';

const ENTITY_READS = new Set([
  'find',
  'findOne',
  'findOneOrFail',
  'findAndCount',
  'findAll',
  'count',
  'getReference',
  'getRepository',
]);

interface RuleScopedEntity {
  className: string;
  tableName: string;
}

function parse(file: string, text = readFileSync(file, 'utf8')): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) return expression.expression.text;
  if (ts.isIdentifier(expression)) return expression.text;
  return null;
}

/** Every class under `entities/` decorated `@RuleScoped()`, with its table. */
function ruleScopedEntities(): RuleScopedEntity[] {
  const found: RuleScopedEntity[] = [];
  const dir = join(BACKEND, 'entities');
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.entity.ts')).sort()) {
    const source = parse(join(dir, name));
    for (const statement of source.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const decorators = ts.getDecorators(statement) ?? [];
      if (!decorators.some((d) => decoratorName(d) === 'RuleScoped')) continue;
      const entity = decorators.find((d) => decoratorName(d) === 'Entity');
      let tableName: string | null = null;
      if (entity && ts.isCallExpression(entity.expression)) {
        const options = entity.expression.arguments[0];
        if (options && ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.name) &&
              property.name.text === 'tableName' &&
              ts.isStringLiteralLike(property.initializer)
            ) {
              tableName = property.initializer.text;
            }
          }
        }
      }
      if (!tableName) throw new Error(`${name}: @RuleScoped class ${statement.name.text} declares no tableName`);
      found.push({ className: statement.name.text, tableName });
    }
  }
  return found;
}

/** Every `.ts` source under `dir`, tests excluded, relative to the backend root. */
function sources(dir: string): string[] {
  const root = join(BACKEND, dir);
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sources(join(dir, entry)));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      out.push(relative(BACKEND, path).split(sep).join('/'));
    }
  }
  return out.sort();
}

/**
 * The reads of a rule-scoped table in one source, as `line: what` strings.
 * Exported shape for the detector's own cases below.
 */
function readsIn(source: ts.SourceFile, entities: readonly RuleScopedEntity[]): string[] {
  const classes = new Set(entities.map((e) => e.className));
  const tables = new Set(entities.map((e) => e.tableName));
  const sqlTable = /\b(?:from|join)\s+"?([a-z_]+)"?/gi;
  const found: string[] = [];
  const at = (node: ts.Node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const first = node.arguments[0];
      if (ENTITY_READS.has(method) && first) {
        const named = ts.isIdentifier(first) ? first.text : ts.isStringLiteralLike(first) ? first.text : null;
        if (named && classes.has(named)) found.push(`${at(node)}: ${method}(${named})`);
      }
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const match of node.text.matchAll(sqlTable)) {
        const table = match[1]!.toLowerCase();
        if (tables.has(table)) found.push(`${at(node)}: SQL reads "${table}"`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('the ProjectAccess seam (R-2)', () => {
  const entities = ruleScopedEntities();

  it('derives the rule-scoped set from the entity declarations — every Project-owned table of the data model', () => {
    expect(entities.map((e) => e.tableName).sort()).toEqual(
      [
        'project_attachments',
        'project_comments',
        'project_links',
        'project_member_roles',
        'project_members',
        'project_message_reads',
        'project_organizations',
        'project_references',
        'project_stage_alert_deliveries',
        'project_stage_entries',
        'project_stage_moves',
        'project_stage_tasks',
        'project_stages',
        'project_viewers',
        'projects',
      ].sort(),
    );
  });

  it('no route or service reads a rule-scoped table outside ProjectAccess and its allow-list', () => {
    const offenders: string[] = [];
    for (const file of [...sources('routes'), ...sources('services')]) {
      if (file === ACCESS_FILE || file in PROJECT_ACCESS_READERS) continue;
      for (const read of readsIn(parse(join(BACKEND, file)), entities)) offenders.push(`${file}:${read}`);
    }
    expect(offenders, 'read the Project through ProjectAccess (loadVisible / visibleProjectSql)').toEqual([]);
  });

  it('every allow-listed file exists, says why, and does read a rule-scoped table — no stale entry', () => {
    const scanned = new Set([...sources('routes'), ...sources('services')]);
    for (const [file, reason] of Object.entries(PROJECT_ACCESS_READERS)) {
      expect(scanned.has(file), `${file} is allow-listed but is not a source under routes/ or services/`).toBe(true);
      expect(reason.trim().length, `${file} is allow-listed without a reason`).toBeGreaterThan(20);
      expect(
        readsIn(parse(join(BACKEND, file)), entities),
        `${file} is allow-listed but reads no rule-scoped table — remove the entry`,
      ).not.toEqual([]);
    }
  });

  describe('the detector itself', () => {
    const probe = [{ className: 'Project', tableName: 'projects' }, { className: 'ProjectStage', tableName: 'project_stages' }];
    const check = (text: string) => readsIn(parse('probe.ts', text), probe);

    it('finds an entity-manager read naming a rule-scoped class', () => {
      expect(check(`await em.findOne(Project, { id });`)).toEqual(['1: findOne(Project)']);
      expect(check(`await this.deps.em().find(ProjectStage, {});`)).toEqual(['1: find(ProjectStage)']);
      expect(check(`em.findOneOrFail('Project', id)`)).toEqual(['1: findOneOrFail(Project)']);
      expect(check(`em.getRepository(Project)`)).toEqual(['1: getRepository(Project)']);
    });

    it('finds SQL selecting or joining a rule-scoped table, quoted or not', () => {
      expect(check('execute(`select * from "projects" p where p.id = ?`)')).toEqual(['1: SQL reads "projects"']);
      expect(check(`execute('select 1 from x join project_stages s on true')`)).toEqual(['1: SQL reads "project_stages"']);
      expect(check('execute(`select ${cols} from "project_stages" s`)')).toEqual(['1: SQL reads "project_stages"']);
    });

    it('leaves alone what is not a read of a rule-scoped table', () => {
      expect(check(`em.findOne(ProjectRole, id); em.persist(project); execute('select 1 from "project_roles"');`)).toEqual([]);
    });
  });
});
