import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type {
  ProjectDetail,
  ProjectRole,
  ProjectStage,
  ProjectStageMove,
  StageTaskDefinition,
  UpdateProjectStageBody,
} from '@endora-commerce/contracts';
import { useModulePresence } from '@endora-commerce/admin-kit/lib';
import { Alert, AlertDescription, Button, Checkbox, ColorPicker, Input, Label } from '@endora-commerce/admin-kit/ui';
import {
  StatusTransitionGraph,
  type StatusTransitionGraphStatus,
  type StatusTransitionGraphTransition,
} from '@endora-commerce/admin-kit/components';
import { useAppLanguage, useTranslation } from '@endora-commerce/admin-kit/i18n';
import { projectsApi } from '../api.js';
import { calendarDateLabel, errorMessage, parseAlertOffsets, parseDuration } from '../lib/labels.js';
import { stageColorAt } from '../lib/stage-colors.js';
import { StageDot } from './StageDot.js';
import { StageTasksEditor } from './StageTasksEditor.js';

/** The module whose presence decides whether Stage Task definitions are shown (Principle XVII). */
const TASKS_MODULE = 'tasks';

export interface StageEditorProps {
  project: ProjectDetail;
  onChange: (project: ProjectDetail) => void;
  reload: () => Promise<void>;
}

interface StageDraft {
  name: string;
  color: string;
  duration: string;
  responsibleRoleIds: string[];
  alerts: string;
  completionGate: boolean;
  completionPermitted: boolean;
}

function draftOf(stage: ProjectStage): StageDraft {
  return {
    name: stage.name,
    color: stage.color,
    duration: String(stage.plannedDurationDays),
    responsibleRoleIds: [...stage.responsibleRoleIds],
    alerts: stage.alertOffsetsDays.join(', '),
    completionGate: stage.completionGate,
    completionPermitted: stage.completionPermitted,
  };
}

const sameSet = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value) => b.includes(value));

/**
 * The PATCH body for what changed between a Stage and its draft, `null` when a
 * value cannot be sent, or an empty object when nothing changed.
 */
function changesOf(stage: ProjectStage, draft: StageDraft): UpdateProjectStageBody | null {
  const days = parseDuration(draft.duration);
  const alerts = parseAlertOffsets(draft.alerts);
  if (draft.name.trim() === '' || days === null || alerts === null) return null;
  return {
    ...(draft.name.trim() !== stage.name ? { name: draft.name.trim() } : {}),
    ...(draft.color !== stage.color ? { color: draft.color } : {}),
    ...(days !== stage.plannedDurationDays ? { plannedDurationDays: days } : {}),
    ...(!sameSet(draft.responsibleRoleIds, stage.responsibleRoleIds)
      ? { responsibleRoleIds: draft.responsibleRoleIds }
      : {}),
    ...(!sameSet(alerts, stage.alertOffsetsDays) ? { alertOffsetsDays: alerts } : {}),
    ...(draft.completionGate !== stage.completionGate ? { completionGate: draft.completionGate } : {}),
    ...(draft.completionPermitted !== stage.completionPermitted
      ? { completionPermitted: draft.completionPermitted }
      : {}),
  } as UpdateProjectStageBody;
}

/**
 * A Project's Stages and workflow, edited in place (`specs/163-projects-and-tasks/`,
 * User Story 1; `contracts/admin-surfaces.md` §2, the *Stages* tab).
 *
 * **Each Stage is saved on its own** — `PATCH /stages/:stageId` takes any of its
 * attributes — so an edit to one Stage never waits on another's mistake. Adding
 * puts a Stage at the end; deleting refuses the current Stage and a Project's
 * only one, in the server's words. Reordering moves one Stage one place.
 *
 * **The workflow** is drawn with the kit's `StatusTransitionGraph`, whose
 * From/To form is the keyboard path; every change replaces the whole set
 * (`PUT /moves`) and the answer names the Stages no move reaches from the first,
 * which the editor warns about — a warning, not an error (FR-011).
 *
 * **Stage Task definitions** (User Story 2) are a section of each Stage, shown
 * only while the Tasks module is present: off, they stay stored, untouched and
 * unseen, and come back with it. Each Stage's list is saved whole
 * (`PUT /stages/:stageId/tasks`). The Template editor of User Story 3 is meant
 * to share this editor.
 */
export function StageEditor(props: StageEditorProps): ReactNode {
  const { project, onChange, reload } = props;
  const t = useTranslation('projects');
  const canWrite = project.permissions.canWrite;
  const tasksPresent = useModulePresence().isPresent(TASKS_MODULE);
  const [roles, setRoles] = useState<ProjectRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // Every Role, archived ones too: a Stage still names the ones it uses.
  useEffect(() => {
    let alive = true;
    projectsApi
      .listRoles()
      .then((loaded) => {
        if (alive) setRoles(loaded);
      })
      .catch(() => {
        if (alive) setRoles([]);
      });
    return (): void => {
      alive = false;
    };
  }, []);

  const stages = useMemo(() => [...project.stages].sort((a, b) => a.position - b.position), [project.stages]);
  const nameOf = useCallback(
    (stageId: string): string => stages.find((stage) => stage.id === stageId)?.name ?? stageId,
    [stages],
  );

  /** Run one write: on success say so and show the server's state, on failure its sentence. */
  const run = async (write: () => Promise<void>, done: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await write();
      setNotice(done);
      return true;
    } catch (failure) {
      setError(errorMessage(failure, t('editor.error')));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveStage = (stage: ProjectStage, body: UpdateProjectStageBody): Promise<boolean> =>
    run(async () => {
      await projectsApi.updateStage(project.id, stage.id, body);
      await reload();
    }, t('editor.saved'));

  const saveStageTasks = (stage: ProjectStage, tasks: StageTaskDefinition[]): Promise<boolean> =>
    run(async () => {
      await projectsApi.setStageTasks(project.id, stage.id, tasks);
      await reload();
    }, t('stageTasks.saved'));

  const deleteStage = (stage: ProjectStage): Promise<boolean> =>
    run(async () => {
      await projectsApi.deleteStage(project.id, stage.id);
      await reload();
    }, t('editor.deleted'));

  const addStage = (): Promise<boolean> =>
    run(async () => {
      await projectsApi.createStage(project.id, { name: t('editor.newStage'), color: stageColorAt(stages.length) });
      await reload();
    }, t('editor.added'));

  const moveStage = (index: number, by: -1 | 1): Promise<boolean> => {
    const ids = stages.map((stage) => stage.id);
    const target = index + by;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    return run(async () => onChange(await projectsApi.reorderStages(project.id, ids)), t('editor.reordered'));
  };

  const setMoves = (moves: ProjectStageMove[]): Promise<boolean> =>
    run(async () => {
      const result = await projectsApi.setMoves(project.id, moves);
      onChange({ ...project, moves: result.moves, unreachableStageIds: result.unreachableStageIds });
    }, t('editor.movesSaved'));

  const graphStatuses = useMemo<StatusTransitionGraphStatus[]>(
    () =>
      stages.map((stage, index) => ({
        code: stage.id,
        name: {},
        defaultName: stage.name,
        isInitial: index === 0,
        isTerminal: false,
        isSystem: false,
        weight: stage.position,
        color: stage.color,
        inUseCount: 0,
      })),
    [stages],
  );
  const graphTransitions = useMemo<StatusTransitionGraphTransition[]>(
    () => project.moves.map((move) => ({ fromStatusCode: move.fromStageId, toStatusCode: move.toStageId, isSystem: false })),
    [project.moves],
  );
  const statusLabel = useCallback((status: StatusTransitionGraphStatus): string => status.defaultName, []);

  const unreachable = project.unreachableStageIds.map(nameOf);

  return (
    <div className="space-y-6">
      {canWrite ? <p className="text-sm text-muted-foreground">{t('editor.hint')}</p> : null}

      <ol className="space-y-3">
        {stages.map((stage, index) => (
          <li key={`${stage.id}:${JSON.stringify(stage)}`}>
            <StageRow
              stage={stage}
              position={index + 1}
              isCurrent={stage.id === project.currentStage?.id}
              isFirst={index === 0}
              isLast={index === stages.length - 1}
              roles={roles}
              canWrite={canWrite}
              tasksPresent={tasksPresent}
              busy={busy}
              onSave={(body): Promise<boolean> => saveStage(stage, body)}
              onSaveTasks={(tasks): Promise<boolean> => saveStageTasks(stage, tasks)}
              onDelete={(): Promise<boolean> => deleteStage(stage)}
              onMove={(by): Promise<boolean> => moveStage(index, by)}
            />
          </li>
        ))}
      </ol>

      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          disabled={busy || stages.length >= 50}
          onClick={(): void => void addStage()}
        >
          <Plus aria-hidden="true" />
          {t('editor.add')}
        </Button>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{t('editor.moves')}</h3>
          <p className="text-sm text-muted-foreground">{t('editor.movesHint')}</p>
        </div>
        {unreachable.length > 0 ? (
          <Alert>
            <AlertDescription>{t('editor.unreachable', { stages: unreachable.join(', ') })}</AlertDescription>
          </Alert>
        ) : null}
        {canWrite ? (
          <StatusTransitionGraph
            statuses={graphStatuses}
            transitions={graphTransitions}
            statusLabel={statusLabel}
            onAdd={(from, to): void => {
              if (project.moves.some((move) => move.fromStageId === from && move.toStageId === to)) return;
              void setMoves([...project.moves, { fromStageId: from, toStageId: to }]);
            }}
            onRemove={(from, to): void =>
              void setMoves(project.moves.filter((move) => !(move.fromStageId === from && move.toStageId === to)))
            }
          />
        ) : project.moves.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('editor.noMoves')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {project.moves.map((move) => (
              <li key={`${move.fromStageId}:${move.toStageId}`}>
                {t('editor.move', { from: nameOf(move.fromStageId), to: nameOf(move.toStageId) })}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p role="status" className="sr-only">
        {notice}
      </p>
    </div>
  );
}

interface StageRowProps {
  stage: ProjectStage;
  position: number;
  isCurrent: boolean;
  isFirst: boolean;
  isLast: boolean;
  roles: readonly ProjectRole[];
  canWrite: boolean;
  /** The Tasks module is present: the Stage's Task definitions are shown. */
  tasksPresent: boolean;
  busy: boolean;
  onSave: (body: UpdateProjectStageBody) => Promise<boolean>;
  onSaveTasks: (tasks: StageTaskDefinition[]) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onMove: (by: -1 | 1) => Promise<boolean>;
}

/** One Stage: its attributes as fields, saved together; or as text for a reader. */
function StageRow(props: StageRowProps): ReactNode {
  const { stage, position, roles, canWrite, busy } = props;
  const t = useTranslation('projects');
  const tCore = useTranslation('core');
  const { language } = useAppLanguage();
  const [draft, setDraft] = useState<StageDraft>(() => draftOf(stage));
  const [invalid, setInvalid] = useState(false);
  const idPrefix = `project-stage-${stage.id}`;

  const change = (patch: Partial<StageDraft>): void => {
    setDraft((previous) => ({ ...previous, ...patch }));
    setInvalid(false);
  };

  // The Roles a Stage may name: the active ones, plus any archived one it already names.
  const offered = roles.filter((role) => role.archivedAt === null || stage.responsibleRoleIds.includes(role.id));
  const roleLabel = (roleId: string): string => roles.find((role) => role.id === roleId)?.label ?? roleId;

  const deadline = stage.deadlineOn ? (
    <p className="text-xs text-muted-foreground">
      {t(stage.deadlineManual ? 'editor.deadlineManual' : 'editor.deadline', {
        date: calendarDateLabel(stage.deadlineOn, language),
      })}
    </p>
  ) : null;

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-sm font-medium tabular-nums text-muted-foreground">
        {position}.
      </span>
      <StageDot color={stage.color} />
      <span className="font-medium [overflow-wrap:anywhere]">{stage.name}</span>
      {props.isCurrent ? <span className="text-xs text-muted-foreground">({t('editor.current')})</span> : null}
    </div>
  );

  if (!canWrite) {
    return (
      <div className="space-y-1 rounded-md border p-3 text-sm">
        {header}
        <p className="text-muted-foreground">
          {stage.plannedDurationDays} {t('stage.durationShort').toLowerCase()}
          {stage.responsibleRoleIds.length > 0 ? ` · ${stage.responsibleRoleIds.map(roleLabel).join(', ')}` : ''}
        </p>
        {stage.completionPermitted ? <p className="text-muted-foreground">{t('editor.completionPermitted')}</p> : null}
        {deadline}
        {props.tasksPresent ? (
          <StageTasksEditor stage={stage} position={position} roles={roles} canWrite={false} busy={busy} onSave={props.onSaveTasks} />
        ) : null}
      </div>
    );
  }

  const save = async (): Promise<void> => {
    const body = changesOf(stage, draft);
    if (body === null) {
      setInvalid(true);
      return;
    }
    if (Object.keys(body).length === 0) return;
    await props.onSave(body);
  };

  const alertsInvalid = invalid && parseAlertOffsets(draft.alerts) === null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      {header}
      {deadline}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={`${idPrefix}-name`} className="text-xs text-muted-foreground">
            <span aria-hidden="true">{t('stage.nameShort')}</span>
          </Label>
          <Input
            id={`${idPrefix}-name`}
            aria-label={t('stage.name', { position })}
            value={draft.name}
            maxLength={80}
            aria-invalid={invalid && draft.name.trim() === ''}
            onChange={(event): void => change({ name: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <span aria-hidden="true" className="block text-xs text-muted-foreground">
            {t('stage.colorShort')}
          </span>
          <ColorPicker
            value={draft.color}
            onChange={(color): void => change({ color })}
            label={t('stage.color', { position })}
            customLabel={t('stage.colorCustom', { position })}
          />
        </div>
        <div className="w-24 space-y-1">
          <Label htmlFor={`${idPrefix}-days`} className="text-xs text-muted-foreground">
            <span aria-hidden="true">{t('stage.durationShort')}</span>
          </Label>
          <Input
            id={`${idPrefix}-days`}
            aria-label={t('stage.duration', { position })}
            inputMode="numeric"
            value={draft.duration}
            aria-invalid={invalid && parseDuration(draft.duration) === null}
            onChange={(event): void => change({ duration: event.target.value })}
          />
        </div>
        <div className="min-w-40 flex-1 space-y-1">
          <Label htmlFor={`${idPrefix}-alerts`} className="text-xs text-muted-foreground">
            {t('editor.alerts', { position })}
          </Label>
          <Input
            id={`${idPrefix}-alerts`}
            value={draft.alerts}
            inputMode="numeric"
            aria-invalid={alertsInvalid}
            aria-describedby={`${idPrefix}-alerts-hint`}
            onChange={(event): void => change({ alerts: event.target.value })}
          />
        </div>
      </div>
      <p id={`${idPrefix}-alerts-hint`} className={alertsInvalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {alertsInvalid ? t('editor.alertsInvalid') : t('editor.alertsHint')}
      </p>

      {offered.length > 0 ? (
        <fieldset>
          <legend className="text-xs text-muted-foreground">{t('editor.responsibleRoles', { position })}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {offered.map((role) => {
              const id = `${idPrefix}-role-${role.id}`;
              return (
                <label key={role.id} htmlFor={id} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
                  <Checkbox
                    id={id}
                    checked={draft.responsibleRoleIds.includes(role.id)}
                    onChange={(event): void =>
                      change({
                        responsibleRoleIds: event.target.checked
                          ? [...draft.responsibleRoleIds, role.id]
                          : draft.responsibleRoleIds.filter((roleId) => roleId !== role.id),
                      })
                    }
                  />
                  {role.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-completion`} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
          <Checkbox
            id={`${idPrefix}-completion`}
            checked={draft.completionPermitted}
            onChange={(event): void => change({ completionPermitted: event.target.checked })}
          />
          {t('editor.completionPermitted')}
        </label>
        <label htmlFor={`${idPrefix}-gate`} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-9">
          <Checkbox
            id={`${idPrefix}-gate`}
            checked={draft.completionGate}
            aria-describedby={`${idPrefix}-gate-hint`}
            onChange={(event): void => change({ completionGate: event.target.checked })}
          />
          {t('editor.gate')}
        </label>
        <p id={`${idPrefix}-gate-hint`} className="text-xs text-muted-foreground">
          {t('editor.gateHint')}
        </p>
      </div>

      {invalid && (draft.name.trim() === '' || parseDuration(draft.duration) === null) ? (
        <p className="text-xs text-destructive">
          {draft.name.trim() === '' ? t('create.error.stageName') : t('create.error.stageDuration')}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button
          type="button"
          className="min-h-11 sm:min-h-9"
          aria-label={t('editor.save', { position })}
          disabled={busy}
          onClick={(): void => void save()}
        >
          {tCore('common.action.save')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
          aria-label={t('stage.moveUp', { position })}
          disabled={busy || props.isFirst}
          onClick={(): void => void props.onMove(-1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
          aria-label={t('stage.moveDown', { position })}
          disabled={busy || props.isLast}
          onClick={(): void => void props.onMove(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto min-h-11 text-destructive hover:text-destructive sm:min-h-9"
          aria-label={t('editor.delete', { position })}
          disabled={busy}
          onClick={(): void => void props.onDelete()}
        >
          <Trash2 aria-hidden="true" />
          {tCore('common.action.delete')}
        </Button>
      </div>

      {props.tasksPresent ? (
        <StageTasksEditor stage={stage} position={position} roles={roles} canWrite busy={busy} onSave={props.onSaveTasks} />
      ) : null}
    </div>
  );
}
