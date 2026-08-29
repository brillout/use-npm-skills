The engine — everything `use-npm-skills` does behind its two entry points (`cli.js` for
explicit runs, `postinstall.js` for lifecycle runs).

A sync run flows through the modules in this order: `context.js` determines the kind of run,
the project root, and the configuration; `scan.js` finds the installed skill packages;
`materialize.js` makes the skills directories match them; `repoFiles.js` cleans up legacy
`.gitignore` rules and adds the root postinstall hook when needed; `git.js` commits what the
run changed. `sync.js` orchestrates the whole and announces every action. Alongside the sync,
`init.js` scaffolds skill packages, and `log.js` defines the output format.

- `src/context.SPEC.md` — kind of run (lifecycle vs explicit, CI, global install, Yarn PnP),
  project root discovery, configuration.
- `src/sync.SPEC.md` — the sync run: preconditions, order, the zero-side-effects rule, what
  gets committed, announcements.
- `src/scan.SPEC.md` — which installed packages are skill packages, and each skill's entry
  name.
- `src/materialize.SPEC.md` — managed entries: copying, refreshing, removal of stale
  entries, the hands-off rule for everything unmanaged and hand-edited.
- `src/repoFiles.SPEC.md` — legacy `.gitignore` cleanup; the root postinstall hook.
- `src/git.SPEC.md` — reading the repository's uncommitted state, and the automated bot
  commit with every reason it is skipped.
- `src/init.SPEC.md` — scaffolding a skill package.
- `src/log.SPEC.md` — output format.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
