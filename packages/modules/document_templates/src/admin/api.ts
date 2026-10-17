import {
  documentBuilderConfigSchema,
  documentTemplateDetailSchema,
  documentTemplateSummarySchema,
  documentTypeDetailSchema,
  documentTypeSummarySchema,
  type CreateDocumentTemplateBody,
  type DocumentBuilderConfig,
  type DocumentTemplateDetail,
  type DocumentTemplateSummary,
  type DocumentTypeDetail,
  type DocumentTypeSummary,
} from '@endora-commerce/contracts';
import { apiBaseUrl, apiClient } from '@endora-commerce/admin-kit/lib';

/**
 * The document-template screens' reads and writes
 * (`specs/152-compare-pdf-template/contracts/document-templates-api.md`),
 * every answer parsed with the contract it was sent under.
 */
const BASE = '/api/v1/admin/document-templates';

export async function listDocumentTypes(): Promise<DocumentTypeSummary[]> {
  const res = await apiClient.get<{ data: unknown[] }>(`${BASE}/types`);
  return res.data.map((entry) => documentTypeSummarySchema.parse(entry));
}

export async function getDocumentType(code: string, language?: string): Promise<DocumentTypeDetail> {
  const query = language ? `?language=${encodeURIComponent(language)}` : '';
  const res = await apiClient.get<{ data: unknown }>(`${BASE}/types/${encodeURIComponent(code)}${query}`);
  return documentTypeDetailSchema.parse(res.data);
}

export async function getBuilderConfig(code: string): Promise<DocumentBuilderConfig> {
  const res = await apiClient.get<{ data: unknown }>(`${BASE}/types/${encodeURIComponent(code)}/builder-config`);
  return documentBuilderConfigSchema.parse(res.data);
}

export async function listTemplates(type: string): Promise<DocumentTemplateSummary[]> {
  const res = await apiClient.get<{ data: unknown[] }>(`${BASE}?type=${encodeURIComponent(type)}`);
  return res.data.map((entry) => documentTemplateSummarySchema.parse(entry));
}

export async function getTemplate(id: string): Promise<DocumentTemplateDetail> {
  const res = await apiClient.get<{ data: unknown }>(`${BASE}/${id}`);
  return documentTemplateDetailSchema.parse(res.data);
}

export async function createTemplate(body: CreateDocumentTemplateBody): Promise<DocumentTemplateSummary> {
  const res = await apiClient.post<{ data: unknown }>(BASE, body);
  return documentTemplateSummarySchema.parse(res.data);
}

export async function renameTemplate(id: string, name: string, expectedVersion: number): Promise<DocumentTemplateSummary> {
  const res = await apiClient.patch<{ data: unknown }>(`${BASE}/${id}`, { name, expectedVersion });
  return documentTemplateSummarySchema.parse(res.data);
}

export async function saveTemplateContent(
  id: string,
  language: string,
  tree: unknown,
  expectedVersion: number,
): Promise<DocumentTemplateSummary> {
  const res = await apiClient.put<{ data: unknown }>(`${BASE}/${id}/content/${encodeURIComponent(language)}`, {
    tree,
    expectedVersion,
  });
  return documentTemplateSummarySchema.parse(res.data);
}

export async function setDefaultTemplate(id: string, expectedVersion: number): Promise<DocumentTemplateSummary> {
  const res = await apiClient.post<{ data: unknown }>(`${BASE}/${id}/set-default`, { expectedVersion });
  return documentTemplateSummarySchema.parse(res.data);
}

export async function clearDefaultTemplate(id: string, expectedVersion: number): Promise<DocumentTemplateSummary> {
  const res = await apiClient.post<{ data: unknown }>(`${BASE}/${id}/clear-default`, { expectedVersion });
  return documentTemplateSummarySchema.parse(res.data);
}

export async function deleteTemplate(id: string, expectedVersion: number, confirmDefault: boolean): Promise<void> {
  await apiClient.delete(`${BASE}/${id}?expectedVersion=${expectedVersion}&confirmDefault=${confirmDefault}`);
}

/** The PDF of a tree with the type's sample — nothing is saved. */
export async function previewDocument(documentType: string, language: string, tree: unknown): Promise<Blob> {
  const res = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}${BASE}/preview`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
    body: JSON.stringify({ documentType, language, tree }),
  });
  if (!res.ok) throw new Error(`preview failed: ${res.status}`);
  return res.blob();
}

/** Active content languages, for a type that does not restrict its languages. */
export async function listContentLanguages(): Promise<string[]> {
  const res = await apiClient.get<{ data: { languages: { code: string }[] } }>('/api/v1/i18n/config');
  return res.data.languages.map((language) => language.code);
}

/** Sales channels for the scope choice; empty when the caller may not list them. */
export async function listSalesChannels(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await apiClient.get<{ data: { id: string; code: string; name: Record<string, string> | string }[] }>(
      '/api/v1/admin/sales-channels?limit=200',
    );
    return res.data.map((channel) => ({
      id: channel.id,
      name:
        typeof channel.name === 'string'
          ? channel.name
          : (channel.name['en-US'] ?? Object.values(channel.name)[0] ?? channel.code),
    }));
  } catch {
    return [];
  }
}
