The library entry point of the `use-npm-skills` npm package: re-exports the sync function (see `sync.SPEC.md`) and the two package-hook functions (see `hooks.SPEC.md`) together with the public types and constants (see `types.SPEC.md`) and the logger (see `logger.SPEC.md`), so other tools can run and inspect a sync or a hook programmatically instead of shelling out to the command line. No business logic of its own.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
