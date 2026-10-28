import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import type { CreateTaskBody } from '@endora-commerce/contracts';
import { TASK_TITLE_MAX } from '@endora-commerce/contracts';
import { CustomFieldValuesPanel } from '@endora-commerce/admin-kit/components';
import { useAuth } from '@endora-commerce/admin-kit/lib';
import { Alert, AlertDescription, Button, Card, CardContent, Input, Label, PageHeader } from '@endora-commerce/admin-kit/ui';
import { useAppLanguage, useTranslation } from '@endora-commerce/admin-kit/i18n';
import { tasksApi } from '../api.js';
import { AssigneePicker, type ChosenAssignee } from '../components/AssigneePicker.js';
import { dueOf, TaskFieldInputs, taskFieldValuesOf, type TaskFieldValues } from '../components/TaskFieldInputs.js';
import { useCurrentAdmin } from '../lib/current-admin.js';
import { errorMessage } from '../lib/labels.js';

/**
 * Creating a Task (`specs/163-projects-and-tasks/`, User Story 2;
 * `contracts/admin-surfaces.md` §2).
 *
 * A Task created here belongs to no record — a Project's Tasks are created on
 * the Project's own *Tasks* tab, into a Stage, which is the only place that
 * knows the Stage. A title is required; everything else is not — the
 * description in the kit's reference editor, the due date with an optional
 * time, the start date, the priority, the tags, the assignees and the `task`
 * custom fields (`specs/165-task-management/` User Story 1). The new Task
 * starts in the workflow's initial status and opens.
 */
export function TaskCreate(): ReactNode {
  const t = useTranslation('tasks');
  const navigate = useNavigate();
  const me = useCurrentAdmin();
  const { hasPermission } = useAuth();
  const { language } = useAppLanguage();
  const ids = { title: useId(), assignee: useId() };
  const [title, setTitle] = useState('');
  const [fields, setFields] = useState<TaskFieldValues>(() => taskFieldValuesOf());
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [assignees, setAssignees] = useState<ChosenAssignee[]>([]);
  const [missingTitle, setMissingTitle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (title.trim() === '') {
      setMissingTitle(true);
      return;
    }
    const due = dueOf(fields);
    const body: CreateTaskBody = {
      title: title.trim(),
      ...(fields.description.trim() ? { description: fields.description } : {}),
      ...(due.dueAt ? { dueAt: due.dueAt } : due.dueOn ? { dueOn: due.dueOn } : {}),
      ...(fields.startOn ? { startOn: fields.startOn } : {}),
      ...(fields.priorityCode ? { priorityCode: fields.priorityCode } : {}),
      ...(fields.tagIds.length > 0 ? { tagIds: fields.tagIds } : {}),
      ...(assignees.length > 0 ? { assigneeIds: assignees.map((chosen) => chosen.id) } : {}),
      ...(Object.keys(customFieldValues).length > 0 ? { customFieldValues } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      const created = await tasksApi.createTask(body);
      void navigate(`/tasks/${created.id}`);
    } catch (failure) {
      setError(errorMessage(failure, t('create.error.generic')));
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t('create.title')} description={t('create.description')} back={{ label: t('create.back'), to: '/tasks' }} />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <form className="space-y-5" noValidate onSubmit={(event): void => void submit(event)}>
            <p className="text-xs text-muted-foreground">{t('create.requiredHint')}</p>

            <div className="space-y-1">
              <Label htmlFor={ids.title}>
                {t('field.title')}
                <span aria-hidden="true" className="text-destructive">
                  {' *'}
                </span>
              </Label>
              <Input
                id={ids.title}
                value={title}
                maxLength={TASK_TITLE_MAX}
                required
                aria-invalid={missingTitle}
                aria-describedby={missingTitle ? `${ids.title}-error` : undefined}
                onChange={(event): void => {
                  setTitle(event.target.value);
                  setMissingTitle(false);
                }}
              />
              {missingTitle ? (
                <p id={`${ids.title}-error`} className="text-xs text-destructive">
                  {t('create.error.title')}
                </p>
              ) : null}
            </div>

            <TaskFieldInputs
              values={fields}
              onChange={(patch): void => setFields((previous) => ({ ...previous, ...patch }))}
              taskId={null}
              disabled={busy}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={ids.assignee}>{t('field.assignee')}</Label>
                <AssigneePicker
                  id={ids.assignee}
                  value={assignees}
                  onChange={setAssignees}
                  ariaDescribedBy={`${ids.assignee}-hint`}
                />
                <p id={`${ids.assignee}-hint`} className="text-xs text-muted-foreground">
                  {t('field.assigneeHint')}
                </p>
                {me && !assignees.some((chosen) => chosen.id === me.id) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 px-2 sm:min-h-8"
                    onClick={(): void => setAssignees([...assignees, me])}
                  >
                    <UserCheck aria-hidden="true" />
                    {t('detail.assignToMe')}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* The `task` custom fields, sent with the Task (R-8); their definitions are `custom_fields:read`'s. */}
            {hasPermission('custom_fields:read') ? (
              <CustomFieldValuesPanel
                entityType="task"
                values={EMPTY_VALUES}
                onChange={setCustomFieldValues}
                language={language}
              />
            ) : null}

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="submit" className="min-h-11 sm:min-h-9" disabled={busy} aria-busy={busy}>
                {busy ? t('create.submitting') : t('create.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

const EMPTY_VALUES: Record<string, unknown> = {};

/** The default export the route declaration's dynamic-import factory resolves. */
export default TaskCreate;
