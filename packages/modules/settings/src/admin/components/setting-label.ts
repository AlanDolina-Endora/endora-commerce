/**
 * Resolving a setting's name, its description and its group's heading.
 *
 * The Settings screen is generic: it lists every setting every module declares,
 * and the API sends the strings each manifest declared — English, whatever the
 * administrator's language. A module's own bundle is the place its translated
 * copy already lives, so the screen looks there first, by convention:
 *
 *   settingLabels.<setting code>.name
 *   settingLabels.<setting code>.description
 *   settingGroups.<group code>.name
 *
 * The code is embedded whole, dots included, so `seo.default_robots` is read
 * from `settingLabels.seo.default_robots.name`. The declared string is the last
 * resort, which makes this opt-in per key: a module that ships none of these
 * keys renders exactly as it did before.
 *
 * The namespace is known up front and is not scanned for. The bundle endpoint
 * serves a module's bundle under its manifest id, and `ownerModule` is the
 * `moduleCode` of the settings block that declared the row — the same id for
 * every module that declares a setting. Reading only that namespace is also
 * what stops one module renaming another's setting. An owner that is not a
 * module (`manual`, for a group an operator created) has no namespace, finds
 * nothing and keeps its stored name.
 *
 * `resolve` is called directly rather than through `useTranslation`'s `t`: a
 * missing key here is the ordinary case and not a defect, and `t` reports every
 * miss on the development console.
 */
import { useMemo } from 'react';
import { resolve, useTranslationContext } from '@endora-commerce/admin-kit/i18n';
import type { Bundle, SupportedAdminLanguage } from '@endora-commerce/admin-kit/i18n';

/** `settingLabels.<setting code>.name` */
export function settingNameKey(settingCode: string): string {
  return `settingLabels.${settingCode}.name`;
}

/** `settingLabels.<setting code>.description` */
export function settingDescriptionKey(settingCode: string): string {
  return `settingLabels.${settingCode}.description`;
}

/** `settingGroups.<group code>.name` */
export function settingGroupNameKey(groupCode: string): string {
  return `settingGroups.${groupCode}.name`;
}

/** What the translation provider holds for the current administrator. */
export interface SettingLabelSource {
  readonly language: SupportedAdminLanguage;
  readonly bundle: Bundle;
  readonly fallbackBundle?: Bundle | undefined;
}

/** The fields of a setting row the resolver reads. */
export interface LabelledSetting {
  readonly code: string;
  readonly ownerModule: string;
  readonly name: string;
  readonly description?: string | null | undefined;
}

/** The fields of a setting group the resolver reads. */
export interface LabelledSettingGroup {
  readonly code: string;
  readonly ownerModule: string;
  readonly name: string;
}

/** The owner's copy for `key`: the requested language, then English, or `null`. */
function fromOwnerBundle(
  ownerModule: string,
  key: string,
  source: SettingLabelSource,
): string | null {
  const result = resolve({
    scope: ownerModule,
    key,
    language: source.language,
    bundle: source.bundle,
    ...(source.fallbackBundle !== undefined ? { fallbackBundle: source.fallbackBundle } : {}),
  });
  return result.outcome === 'placeholder' ? null : result.value;
}

export function resolveSettingName(setting: LabelledSetting, source: SettingLabelSource): string {
  return fromOwnerBundle(setting.ownerModule, settingNameKey(setting.code), source) ?? setting.name;
}

/** `null` when the owner's bundles carry no description and the manifest declared none. */
export function resolveSettingDescription(
  setting: LabelledSetting,
  source: SettingLabelSource,
): string | null {
  return (
    fromOwnerBundle(setting.ownerModule, settingDescriptionKey(setting.code), source) ??
    setting.description ??
    null
  );
}

export function resolveSettingGroupName(
  group: LabelledSettingGroup,
  source: SettingLabelSource,
): string {
  return fromOwnerBundle(group.ownerModule, settingGroupNameKey(group.code), source) ?? group.name;
}

export interface SettingLabels {
  settingName(setting: LabelledSetting): string;
  settingDescription(setting: LabelledSetting): string | null;
  groupName(group: LabelledSettingGroup): string;
}

/** The three resolvers bound to the current administrator's language and bundles. */
export function useSettingLabels(): SettingLabels {
  const { language, bundle, fallbackBundle } = useTranslationContext();
  return useMemo<SettingLabels>(() => {
    const source: SettingLabelSource = { language, bundle, fallbackBundle };
    return {
      settingName: (setting) => resolveSettingName(setting, source),
      settingDescription: (setting) => resolveSettingDescription(setting, source),
      groupName: (group) => resolveSettingGroupName(group, source),
    };
  }, [language, bundle, fallbackBundle]);
}
