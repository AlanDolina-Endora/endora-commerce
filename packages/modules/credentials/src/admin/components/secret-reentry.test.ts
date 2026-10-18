import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@endora-commerce/contracts';
import { movedEndpointLabels } from './secret-reentry.js';

/**
 * The edit form tells the operator, before they save, which stored secrets
 * they must type again: the server keeps no stored secret once a field saying
 * where it is sent — a Base URL, a mail host — has changed.
 */

const FIELDS: FieldDefinition[] = [
  { key: 'apiKey', label: 'API Key', kind: 'string', required: true, secret: true },
  { key: 'model', label: 'Model', kind: 'string', required: true, secret: false },
  { key: 'baseUrl', label: 'Base URL', kind: 'string', required: false, secret: false, format: 'url' },
];

describe('movedEndpointLabels', () => {
  it('names an endpoint whose value the operator changed', () => {
    expect(
      movedEndpointLabels(FIELDS, { model: 'm', baseUrl: 'https://a.example' }, {
        model: 'm',
        baseUrl: 'https://b.example',
      }),
    ).toEqual(['Base URL']);
  });

  it('counts setting and clearing an endpoint as a change', () => {
    expect(movedEndpointLabels(FIELDS, { model: 'm' }, { model: 'm', baseUrl: 'https://b.example' })).toEqual([
      'Base URL',
    ]);
    expect(movedEndpointLabels(FIELDS, { baseUrl: 'https://a.example' }, { baseUrl: '' })).toEqual([
      'Base URL',
    ]);
  });

  it('ignores a change to a field that is not an endpoint, and surrounding whitespace', () => {
    expect(
      movedEndpointLabels(FIELDS, { model: 'm', baseUrl: 'https://a.example' }, {
        model: 'other',
        baseUrl: ' https://a.example ',
      }),
    ).toEqual([]);
  });
});
