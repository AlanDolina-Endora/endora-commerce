import type { EntityManager } from '@mikro-orm/postgresql';
import type { AssetReference, AssetReferenceDescriptor, AssetReferenceRegistryPort } from '@endora-commerce/contracts';

/**
 * Tasks → `assetReferenceRegistry`: a Task's attachments are references to
 * files of the asset library, and the library refuses to delete a file that is
 * still referenced (`specs/165-task-management/` FR-008, research R-7;
 * Projects' `project-asset-references.ts`, the model).
 *
 * **Referential integrity, not a surface**, so the registry honours it while
 * this module is switched off: the attachments survive a deactivation, and a
 * scanner that stopped answering would let an operator delete a file that
 * comes back as a broken attachment when Tasks is switched on again. The push
 * is made from a contribution-only boot hook with no presence probe.
 *
 * One batched statement, platform-wide on purpose: the question is "does
 * anything still use this file", asked by whoever deletes it in the library —
 * who need not be somebody who may see the Task. For the same reason the label
 * is the Task's number and never its title.
 */
export function registerTaskAssetReferences(registry: AssetReferenceRegistryPort, emFactory: () => EntityManager): void {
  registry.register(taskAttachmentReferenceDescriptor(emFactory));
}

export function taskAttachmentReferenceDescriptor(emFactory: () => EntityManager): AssetReferenceDescriptor {
  return {
    ownerModuleId: 'tasks',
    async findReferences(assetIds: string[]): Promise<AssetReference[]> {
      if (assetIds.length === 0) return [];
      const rows = (await emFactory().execute(
        `select t."id"::text as "id", t."number" as "number"
           from "task_attachments" a
           join "tasks" t on t."id" = a."task_id"
          where a."asset_id" in (${assetIds.map(() => '?').join(', ')})
          order by t."number"`,
        [...assetIds],
      )) as Array<{ id: string; number: string }>;
      return rows.map((row) => ({ kind: 'task_attachment', entityId: row.id, label: `Task ${row.number}` }));
    },
  };
}
