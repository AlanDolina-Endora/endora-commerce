---
'@endora-commerce/cli': patch
---

`endora generate` — and so `pnpm run setup` and `pnpm run upgrade`, which run it — now declares
and installs a module of this release that an installed module requires and the instance does
not declare yet. Before, an instance upgraded to a release in which an installed module gained a
dependency on a newly published module package kept only the packages it already declared, and
the backend refused to start with `ReducedDeploymentError` naming the missing module.

The step reads the `dependencies` and `acknowledgedDependencies` of every installed module's
manifest. A module that is not installed, not carried by the platform package and not declared
in `omittedModules` by every deployment's `apps/<deployment>/divergence.ts` is looked up in the
CLI's release index; when a package of the release carries it, that package is added to the
root `package.json` `dependencies` — in place, at the range the platform is declared at, with
the operator kept (exact stays exact, `^` stays `^`) — and `pnpm install` runs before the
artefacts are rendered. This repeats until nothing is missing. A run with nothing missing writes
nothing and runs nothing; `--dry-run` reports what it would declare; a failed install exits 2
with the manifest already declaring the package, so running `pnpm run setup` again continues. A
required module that no package of the release carries is named and left alone.

The release index the CLI writes at build (`dist/release-index.json`) now carries a `moduleId`
for every module package; an index written by an older build still reads. `GenerateResult` gains
`declared`, `unlisted` and `releaseIndexError`, and `GenerateOptions` gains `releaseIndexFile`,
`run` and `echo`.
