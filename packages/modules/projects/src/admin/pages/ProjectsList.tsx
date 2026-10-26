import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Plus, SearchX, X } from 'lucide-react';
import type { ProjectState, ProjectSummary } from '@endora-commerce/contracts';
import { useAuth, usePageSizePreference, type PageSizeOption } from '@endora-commerce/admin-kit/lib';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  Checkbox,
  Input,
  Label,
  PageHeader,
  Select,
} from '@endora-commerce/admin-kit/ui';
import {
  OrganizationPicker,
  PaginationFooter,
  ResponsiveTable,
  type ResponsiveColumn,
} from '@endora-commerce/admin-kit/components';
import { useAppLanguage, useTranslation } from '@endora-commerce/admin-kit/i18n';
import { projectsApi, type ProjectListParams, type ProjectSort } from '../api.js';
import { StateBadge } from '../components/StateBadge.js';
import { StageDot } from '../components/StageDot.js';
import { calendarDateLabel, errorMessage, NO_VALUE, valueLabel } from '../lib/labels.js';

const STATES: readonly ProjectState[] = ['open', 'completed', 'lost'];

/** `<field>:<direction>` — one control for the two query parameters. */
const SORTS = [
  'createdAt:desc',
  'createdAt:asc',
  'value:desc',
  'value:asc',
  'deadline:asc',
  'deadline:desc',
] as const;
type SortOption = (typeof SORTS)[number];

/** The most rows `GET /projects` answers in one page (`PROJECT_LIST_LIMIT_MAX`). */
const MAX_PAGE_LIMIT = 100;
const PAGE_SIZES: readonly PageSizeOption[] = [10, 20, 50, 100];

const SEARCH_DEBOUNCE_MS = 300;

interface Filters {
  q: string;
  state: ProjectState | '';
  organizationId: string | null;
  mine: boolean;
}

const NO_FILTERS: Filters = { q: '', state: '', organizationId: null, mine: false };

/**
 * The Projects list (`specs/163-projects-and-tasks/`, User Story 1;
 * `contracts/admin-surfaces.md` §2).
 *
 * Every Project the operator may see — the server applies Organization reach
 * and visibility, so nothing here filters for safety — narrowed by state,
 * Organization, "my projects" and a search over number and title, sorted by
 * creation, value or the current Stage's deadline. The list is keyset-paged
 * and knows its total, so the kit's footer can say "21–40 of 57".
 *
 * The filters by Role, Template and current Stage name arrive with the stories
 * that make them useful.
 */
export function ProjectsList(): ReactNode {
  const t = useTranslation('projects');
  const tCore = useTranslation('core');
  const { language } = useAppLanguage();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('projects:write');
  const { pageSize: preferredPageSize, setPageSize } = usePageSizePreference('projects-list');
  const pageSize = Math.min(preferredPageSize, MAX_PAGE_LIMIT) as PageSizeOption;

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('createdAt:desc');
  /** The cursors that led to the page on screen; empty on the first page. */
  const [trail, setTrail] = useState<string[]>([]);
  const [rows, setRows] = useState<ProjectSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);

  // The search box is typed into; the request follows once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((previous) => (previous.q === search ? previous : { ...previous, q: search }));
      setTrail((previous) => (previous.length === 0 ? previous : []));
    }, SEARCH_DEBOUNCE_MS);
    return (): void => clearTimeout(timer);
  }, [search]);

  const params = useMemo<ProjectListParams>(() => {
    const [field, order] = sort.split(':') as [ProjectSort, 'asc' | 'desc'];
    const cursor = trail[trail.length - 1];
    return {
      ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
      ...(filters.state ? { state: [filters.state] } : {}),
      ...(filters.organizationId ? { organizationId: filters.organizationId } : {}),
      ...(filters.mine ? { memberId: 'me' } : {}),
      sort: field,
      order,
      ...(cursor ? { cursor } : {}),
      limit: pageSize,
    };
  }, [filters, sort, trail, pageSize]);

  const load = useCallback(async (): Promise<void> => {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const page = await projectsApi.listProjects(params);
      // A slower, older answer must not overwrite a newer one.
      if (current !== sequence.current) return;
      setRows(page.items);
      setTotal(page.total);
      setNextCursor(page.nextCursor);
      setLoaded(true);
    } catch (failure) {
      if (current === sequence.current) setError(errorMessage(failure, t('list.error')));
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [params, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Any change of what is asked for starts again from the first page. */
  const change = (patch: Partial<Filters>): void => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setTrail([]);
  };

  const clear = (): void => {
    setSearch('');
    setFilters(NO_FILTERS);
    setTrail([]);
  };

  const filtered =
    search.trim() !== '' || filters.state !== '' || filters.organizationId !== null || filters.mine;

  const columns: ResponsiveColumn<ProjectSummary>[] = [
    {
      id: 'number',
      header: t('list.col.number'),
      primary: true,
      render: (row) => (
        <Link to={`/projects/${row.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {row.number}
        </Link>
      ),
    },
    {
      id: 'title',
      header: t('list.col.title'),
      primary: true,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]">
          <span>{row.title}</span>
          {row.state !== 'open' ? <StateBadge state={row.state} /> : null}
        </span>
      ),
    },
    {
      id: 'organizations',
      header: t('list.col.organizations'),
      render: (row) =>
        row.organizations.length === 0 ? (
          <span className="text-muted-foreground">{t('list.internal')}</span>
        ) : (
          <span className="[overflow-wrap:anywhere]">{row.organizations.map((org) => org.name).join(', ')}</span>
        ),
    },
    {
      id: 'stage',
      header: t('list.col.stage'),
      render: (row) =>
        row.currentStage ? (
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <StageDot color={row.currentStage.color} />
              <span>{row.currentStage.name}</span>
            </span>
            {row.currentStage.deadlineOn ? (
              <span
                className={
                  row.currentStage.overdue ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'
                }
              >
                {t('list.deadline', { date: calendarDateLabel(row.currentStage.deadlineOn, language) })}
                {row.currentStage.overdue ? (
                  <>
                    {' · '}
                    <span>{t('list.overdue')}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </span>
        ) : (
          NO_VALUE
        ),
    },
    {
      id: 'value',
      header: t('list.col.value'),
      className: 'text-right tabular-nums',
      render: (row) => valueLabel(row.value),
    },
    {
      id: 'managers',
      header: t('list.col.managers'),
      hideOnMobile: true,
      render: (row) =>
        row.projectManagers.length === 0 ? NO_VALUE : row.projectManagers.map((person) => person.name).join(', '),
    },
  ];

  const newProject = (
    <Button className="min-h-11 sm:min-h-9" asChild>
      <Link to="/projects/new">
        <Plus aria-hidden="true" />
        {t('list.new')}
      </Link>
    </Button>
  );

  const emptyState = filtered ? (
    <div className="b2b-empty">
      <div className="b2b-empty__icon">
        <SearchX aria-hidden="true" />
      </div>
      <div className="b2b-empty__title">{t('list.noResults.title')}</div>
      <div className="b2b-empty__sub">{t('list.noResults.body')}</div>
      <Button className="min-h-11 sm:min-h-9" variant="outline" onClick={clear}>
        <X aria-hidden="true" />
        {t('list.filter.clear')}
      </Button>
    </div>
  ) : (
    <div className="b2b-empty">
      <div className="b2b-empty__icon">
        <ClipboardList aria-hidden="true" />
      </div>
      <div className="b2b-empty__title">{t('list.empty.title')}</div>
      <div className="b2b-empty__sub">{canWrite ? t('list.empty.body') : t('list.empty.bodyReadOnly')}</div>
      {canWrite ? newProject : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        // With nothing listed the empty state carries the one action.
        actions={canWrite && (rows.length > 0 || filtered || !loaded) ? newProject : undefined}
      />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="projects-search">{t('list.search')}</Label>
              <Input
                id="projects-search"
                type="search"
                value={search}
                placeholder={t('list.searchPlaceholder')}
                onChange={(event): void => setSearch(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="projects-state">{t('list.filter.state')}</Label>
              <Select
                id="projects-state"
                value={filters.state}
                onChange={(event): void => change({ state: event.target.value as ProjectState | '' })}
              >
                <option value="">{t('list.filter.stateAll')}</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>
                    {t(`state.${state}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="projects-organization">{t('list.filter.organization')}</Label>
              <OrganizationPicker
                id="projects-organization"
                ariaLabel={t('list.filter.organization')}
                value={filters.organizationId}
                onChange={(organizationId): void => change({ organizationId })}
                placeholder={t('list.filter.organizationPlaceholder')}
              />
            </div>
            <div className="flex items-end">
              <label htmlFor="projects-mine" className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
                <Checkbox
                  id="projects-mine"
                  checked={filters.mine}
                  onChange={(event): void => change({ mine: event.target.checked })}
                />
                {t('list.filter.mine')}
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="projects-sort">{t('list.sort')}</Label>
              <Select
                id="projects-sort"
                className="w-auto"
                value={sort}
                onChange={(event): void => {
                  setSort(event.target.value as SortOption);
                  setTrail([]);
                }}
              >
                {SORTS.map((option) => (
                  <option key={option} value={option}>
                    {t(`list.sortOption.${option.replace(':', '.')}`)}
                  </option>
                ))}
              </Select>
            </div>
            {filtered ? (
              <Button className="min-h-11 sm:min-h-8" variant="ghost" size="sm" onClick={clear}>
                <X aria-hidden="true" />
                {t('list.filter.clear')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6" aria-busy={loading}>
          {/* Mounted before it has text, so a reload is announced (WCAG 4.1.3). */}
          <p role="status" className="sr-only">
            {loading && loaded ? t('list.loading') : ''}
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>
                <Button className="min-h-11 sm:min-h-8" variant="outline" size="sm" onClick={(): void => void load()}>
                  {tCore('common.action.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : !loaded ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('list.loading')}
            </p>
          ) : (
            <>
              <ResponsiveTable
                data={rows}
                columns={columns}
                keyExtractor={(row): string => row.id}
                emptyState={emptyState}
              />
              {total > 0 ? (
                <PaginationFooter
                  page={trail.length}
                  pageSize={pageSize}
                  total={total}
                  pageSizes={PAGE_SIZES}
                  onPageSizeChange={(next): void => {
                    setPageSize(next);
                    setTrail([]);
                  }}
                  onPrev={(): void => setTrail((previous) => previous.slice(0, -1))}
                  onNext={(): void => {
                    if (nextCursor && !loading) setTrail((previous) => [...previous, nextCursor]);
                  }}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** The default export the route declaration's dynamic-import factory resolves. */
export default ProjectsList;
