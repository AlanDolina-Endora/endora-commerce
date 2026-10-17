import type { BlockCategory, BlockDefinition, ModuleManifest } from '@endora-commerce/contracts';

/**
 * The Page Builder block declarations of the **present** modules, found by
 * name (research R-6). A block's label, category, editable fields and default
 * props are its declaring module's manifest's — the same declaration the CMS
 * and e-mail palettes read — so the document-template editor and the renderer
 * agree with every other surface on what a block is.
 *
 * Read on every call: the manifest list is static, presence is not.
 */
export interface ManifestSource {
  readonly manifest: ModuleManifest;
}

export interface DeclaredBlock extends BlockDefinition {
  readonly ownerModule: string;
}

export interface DeclaredCategory extends BlockCategory {
  readonly ownerModule: string;
}

export class BlockDeclarations {
  constructor(
    private readonly manifests: () => ReadonlyArray<ManifestSource>,
    private readonly isModulePresent: (moduleId: string) => boolean = () => true,
  ) {}

  find(name: string): DeclaredBlock | undefined {
    for (const { manifest } of this.manifests()) {
      if (!this.isModulePresent(manifest.id)) continue;
      const block = (manifest.blocks ?? []).find((candidate) => candidate.name === name);
      if (block) return { ...block, ownerModule: manifest.id };
    }
    return undefined;
  }

  /** Every name a present module declares — what FR-019 refuses when the type does not offer it. */
  isDeclared(name: string): boolean {
    return this.find(name) !== undefined;
  }

  /** The declared default props of a block, or `{}`. */
  defaultProps(name: string): Readonly<Record<string, unknown>> {
    return this.find(name)?.defaultProps ?? {};
  }

  /** Every category a present module declares, with its declaring module. */
  categories(): DeclaredCategory[] {
    const out: DeclaredCategory[] = [];
    for (const { manifest } of this.manifests()) {
      if (!this.isModulePresent(manifest.id)) continue;
      for (const category of manifest.blockCategories ?? []) out.push({ ...category, ownerModule: manifest.id });
    }
    return out;
  }
}
