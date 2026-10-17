import { defineModuleManifest, defineModuleSettingsManifest } from '@endora-commerce/contracts';

/**
 * Document templates — operator-designed Page Builder layouts for the PDF
 * documents the platform produces (`specs/152-compare-pdf-template/`).
 *
 * The module owns the template storage (`document_templates`, plus the import
 * markers of `document_template_imports`), the Commands that write it, the
 * admin API and screens, the Page Builder → pdfmake engine and the six
 * general-purpose blocks. It owns no document: a **document type** is
 * contributed by the module whose data the document prints — `comparisons`
 * and `invoices` in this release — through the `documentTypeRegistry`
 * contribution registry, and that module produces its documents through the
 * gated `documentRenderPort`, handing over its own data.
 *
 * It is operator-toggleable (Constitution XVII). While it is off the
 * comparison PDF falls back to the comparison module's fixed layout; invoices
 * bind it (research R-27, owner answer N2), so the lifecycle refuses to switch
 * it off while invoicing is on. Switching it off deletes nothing.
 */

const settings = defineModuleSettingsManifest({
  moduleCode: 'document_templates',
  groups: [{ code: 'document_templates', name: 'Document templates' }],
  settings: [
    {
      // The operator's activation control. Platform-wide.
      code: 'document_templates.enabled',
      name: 'Document templates enabled',
      description:
        'Switches the document templates screens, their API and template-based PDFs on or off. While it is off the product comparison PDF uses its fixed built-in layout. It cannot be switched off while invoicing is on, because invoice PDFs are produced from these templates. Nothing is dropped — every template comes back unchanged when you switch it back on.',
      groupCode: 'document_templates',
      valueType: 'boolean',
      defaultValue: true,
    },
  ],
});

export const manifest = defineModuleManifest({
  id: 'document_templates',
  name: 'Document templates',
  description:
    'Design the PDF documents the platform produces — the product comparison and the invoice — in the Page Builder, per document type, language and sales channel.',
  version: '1.0.0',
  // `settings` stores the activation control, `auth` owns `requireAdmin`, and
  // `assets_library` serves the bytes of the images an operator places in a
  // template. All three are non-deactivatable, so this module holds no other
  // module's switch.
  dependencies: ['settings', 'auth', 'assets_library'],
  settings,
  activation: { settingCode: 'document_templates.enabled', default: true },
  i18n: { bundlesDir: 'i18n' },
  docs: { dir: 'docs' },
  demo: false,
});
