import type { ReactNode } from 'react';
import type { ProjectMember } from '@endora-commerce/contracts';
import { useAppLanguage, useTranslation } from '@endora-commerce/admin-kit/i18n';
import { calendarDateLabel } from '../../../lib/labels.js';
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

/**
 * A Project's *Overview* tab (`contracts/admin-surfaces.md` §2): the
 * description, the start date and the Members by Role. Custom fields join it
 * with their story.
 */
export function OverviewTab({ project }: ProjectTabProps): ReactNode {
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
