/**
 * The `./migrations` subpath — every migration class this module owns, as one
 * ordered `migrations` array. The platform reads the array when the package is
 * installed and refuses a package whose `./migrations` export carries none; a
 * class that is in neither the array nor the barrel is a migration that does
 * not run.
 *
 * The named export stays beside the array: the host's generated migration
 * registry imports each class by name from this specifier, and a migration
 * class name is contract — `mikro_orm_migrations` persists it.
 */

import { Migration20261026T144350ProjectsInit } from './20261026T144350_projects_init.js';

export const migrations = [Migration20261026T144350ProjectsInit];

export { Migration20261026T144350ProjectsInit };
