import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';
import type { ProjectRecordKind } from '@endora-commerce/contracts';
import { RuleScoped } from '@endora-commerce/platform/tenancy';
import { randomUUID } from 'crypto';

/**
 * An Order, a Quote Request or an Opportunity linked to a Project (research
 * R-10). The record is held by value; a record belongs to at most one Project.
 */
@RuleScoped()
@Entity({ tableName: 'project_links' })
export class ProjectLink {
  [OptionalProps]?: 'id' | 'linkedByAdminUserId' | 'linkedAt';

  @PrimaryKey({ type: 'uuid' })
  id: string = randomUUID();

  @Property({ type: 'uuid' })
  projectId!: string;

  @Property({ type: 'text' })
  recordKind!: ProjectRecordKind;

  @Property({ type: 'uuid' })
  recordId!: string;

  @Property({ type: 'uuid', nullable: true })
  linkedByAdminUserId?: string | null;

  @Property({ type: 'datetime', onCreate: () => new Date() })
  linkedAt: Date = new Date();
}
