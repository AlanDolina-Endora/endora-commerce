import { useId, useState, type ReactNode } from 'react';
import type { DocumentTemplateSummary } from '@endora-commerce/contracts';
import { ModalDialog } from '@endora-commerce/admin-kit/components';
import { Button, Checkbox, Input, Label } from '@endora-commerce/admin-kit/ui';
import { useTranslation } from '@endora-commerce/admin-kit/i18n';

/**
 * Create a template, or duplicate one (FR-003, FR-004): a name, a scope — all
 * channels or one — fixed for good once created, the source (the built-in
 * layout or a template of the same type) and an explicit *Set as default*,
 * unticked: a new template changes no document until it is made the default.
 */
export interface NewTemplateValues {
  readonly name: string;
  readonly salesChannelId: string | null;
  readonly sourceTemplateId: string | null;
  readonly setDefault: boolean;
}

export interface NewTemplateDialogProps {
  readonly channels: readonly { id: string; name: string }[];
  readonly templates: readonly DocumentTemplateSummary[];
  readonly initialSource: string | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (values: NewTemplateValues) => void;
  readonly onClose: () => void;
}

export function NewTemplateDialog(props: NewTemplateDialogProps): ReactNode {
  const { channels, templates, initialSource, busy, error, onSubmit, onClose } = props;
  const t = useTranslation('document_templates');
  const ids = { name: useId(), scope: useId(), source: useId(), setDefault: useId() };
  const sourceName = templates.find((template) => template.id === initialSource)?.name;
  const [name, setName] = useState(sourceName ? t('dialog.copyOf', { name: sourceName }) : '');
  const [scope, setScope] = useState<string>('global');
  const [source, setSource] = useState<string>(initialSource ?? 'built_in');
  const [setDefault, setSetDefault] = useState(false);

  return (
    <ModalDialog
      title={initialSource ? t('dialog.duplicateTitle') : t('dialog.newTitle')}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('dialog.cancel')}
          </Button>
          <Button
            disabled={busy || name.trim() === ''}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                salesChannelId: scope === 'global' ? null : scope,
                sourceTemplateId: source === 'built_in' ? null : source,
                setDefault,
              })
            }
          >
            {t('dialog.create')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor={ids.name}>{t('dialog.name')}</Label>
          <Input id={ids.name} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.scope}>{t('dialog.scope')}</Label>
          <select
            id={ids.scope}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="global">{t('page.allChannels')}</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('dialog.scopeHint')}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.source}>{t('dialog.source')}</Label>
          <select
            id={ids.source}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="built_in">{t('page.builtIn')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id={ids.setDefault} checked={setDefault} onChange={(event) => setSetDefault(event.target.checked)} />
          <Label htmlFor={ids.setDefault}>{t('dialog.setDefault')}</Label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </ModalDialog>
  );
}
