import { useState, type ReactNode } from 'react';
import type { ProjectDetail, ProjectMember } from '@endora-commerce/contracts';
import { Alert, AlertDescription, Button } from '@endora-commerce/admin-kit/ui';
import { useAppLanguage, useTranslation } from '@endora-commerce/admin-kit/i18n';
import { projectsApi } from '../../../api.js';
import {
  VisibilityControl,
  VisibilityEffect,
  visibilityBody,
  type VisibilityValue,
} from '../../../components/VisibilityControl.js';
import { calendarDateLabel, errorMessage } from '../../../lib/labels.js';
import type { ProjectTabProps } from '../tabs.js';

interface RoleGroup {
  key: string;
  title: string;
  members: ProjectMember[];
}

/**
 * Members grouped by the Project Roles they hold, in the order the Roles first
 * appear, then the Members holding none. A Member with two Roles is in both
 * groups — that is what "by Role" answers.
 */
function groupByRole(members: readonly ProjectMember[], archived: (name: string) => string, noRole: string): RoleGroup[] {
  const groups = new Map<string, RoleGroup>();
  const without: ProjectMember[] = [];
  for (const member of members) {
    if (member.roles.length === 0) without.push(member);
    for (const role of member.roles) {
      const group = groups.get(role.id) ?? {
        key: role.id,
        title: role.archived ? archived(role.name) : role.name,
        members: [],
      };
      group.members.push(member);
      groups.set(role.id, group);
    }
  }
  return [...groups.values(), ...(without.length > 0 ? [{ key: 'none', title: noRole, members: without }] : [])];
}

function valueOf(project: ProjectDetail): VisibilityValue {
  return { visibility: project.visibility, viewers: project.viewers.map((viewer) => ({ ...viewer })) };
}

function sameValue(a: VisibilityValue, b: VisibilityValue): boolean {
  const left = visibilityBody(a);
  const right = visibilityBody(b);
  return (
    left.visibility === right.visibility &&
    left.viewerIds.length === right.viewerIds.length &&
    left.viewerIds.every((id) => right.viewerIds.includes(id))
  );
}

/**
 * Who sees the Project (User Story 5). A writer changes it here and saves it
 * on its own — one `PATCH` naming the version read; anybody else is told what
 * it is and who is listed.
 */
function VisibilitySection({ project, onChange }: Pick<ProjectTabProps, 'project' | 'onChange'>): ReactNode {
  const t = useTranslation('projects');
  const [value, setValue] = useState<VisibilityValue>(() => valueOf(project));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!project.permissions.canWrite) {
    return (
      <section className="space-y-2" aria-labelledby="project-visibility-heading">
        <h3 id="project-visibility-heading" className="text-sm font-semibold">
          {t('visibility.section')}
        </h3>
        <p className="text-sm">{t(`visibility.option.${project.visibility}`)}</p>
        <VisibilityEffect visibility={project.visibility} />
        {project.viewers.length > 0 ? (
          <ul aria-label={t('visibility.listed.label')} className="space-y-0.5 text-sm">
            {project.viewers.map((viewer) => (
              <li key={viewer.id} className="[overflow-wrap:anywhere]">
                {viewer.name}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  const changed = !sameValue(value, valueOf(project));
  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const next = await projectsApi.updateProject(project.id, { ...visibilityBody(value), version: project.version });
      setValue(valueOf(next));
      setSaved(true);
      onChange(next);
    } catch (failure) {
      setError(errorMessage(failure, t('visibility.error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <VisibilityControl
        value={value}
        disabled={busy}
        onChange={(next): void => {
          setValue(next);
          setSaved(false);
        }}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="min-h-11 sm:min-h-9"
          disabled={!changed || busy}
          aria-busy={busy}
          onClick={(): void => void save()}
        >
          {busy ? t('visibility.saving') : t('visibility.save')}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {saved ? t('visibility.saved') : ''}
        </p>
      </div>
    </section>
  );
}

/**
 * A Project's *Overview* tab (`contracts/admin-surfaces.md` §2): the
 * description, the start date, who sees the Project and the Members by Role.
 * Custom fields join it with their story.
 */
export function OverviewTab({ project, onChange }: ProjectTabProps): ReactNode {
  const t = useTranslation('projects');
  const { language } = useAppLanguage();
  const groups = groupByRole(project.members, (role) => t('overview.archivedRole', { role }), t('overview.noRole'));

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">{t('overview.description')}</h3>
          {project.description.trim() ? (
            <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{project.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t('overview.noDescription')}</p>
          )}
        </section>
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">{t('overview.startOn')}</h3>
          <p className="text-sm">{calendarDateLabel(project.startOn, language)}</p>
        </section>
        <VisibilitySection project={project} onChange={onChange} />
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">{t('overview.members')}</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('overview.noMembers')}</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="space-y-1">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</h4>
              <ul className="space-y-0.5 text-sm">
                {group.members.map((member) => (
                  <li key={member.id} className="[overflow-wrap:anywhere]">
                    <span>{member.adminUser.name}</span>
                    {member.adminUser.active ? null : (
                      <span className="text-muted-foreground"> ({t('overview.inactive')})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

export default OverviewTab;
