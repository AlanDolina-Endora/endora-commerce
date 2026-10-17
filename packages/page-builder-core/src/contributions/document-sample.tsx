'use client';

// The sample document a document-template editor hands its block renderers
// (`specs/152-compare-pdf-template/contracts/admin-ui.md` §5).
//
// A context rather than a prop for the reason `environment.tsx` gives: Puck
// owns the props a block receives, and they are the stored template's. The
// value is the type's sample as the backend serves it — the same object the
// server's *Preview PDF* renders — so a canvas never draws from a frontend
// copy that can drift from the document (FR-016).

import { createContext, useContext, type ReactNode } from 'react';

const DocumentSampleContext = createContext<unknown>(null);

export function DocumentSampleProvider({
  value,
  children,
}: {
  value: unknown;
  children: ReactNode;
}): ReactNode {
  return <DocumentSampleContext.Provider value={value}>{children}</DocumentSampleContext.Provider>;
}

/**
 * The sample of the template's document type, typed by the caller — the
 * owning module knows its own data shape. `null` outside a provider (and
 * until the editor has loaded the sample), so a renderer draws a neutral state
 * rather than guarding for an exception.
 */
export function useDocumentSample<T>(): T | null {
  return useContext(DocumentSampleContext) as T | null;
}
