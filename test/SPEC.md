What the test suite covers. The tests exercise the tool end to end through its two entry
points — the command-line interface and the package's own install script. Coverage by file:

- `test/sync.test.SPEC.md` — the sync run: committed entries, skill layouts, entry naming,
  refreshing and cleanup, v0.1 migration, configuration, environment no-ops, and command-line
  basics.
- `test/git.test.SPEC.md` — the automated commit: identity, scope, titles, provenance, the
  per-path stand-downs, and the skip conditions.
- `test/wiring.test.SPEC.md` — postinstall automation: when the root postinstall hook is and
  isn't added, the constraints on lifecycle runs, and the package's own install script.
- `test/init.test.SPEC.md` — scaffolding skill packages.

(`test/util.js` is shared test setup; it covers nothing itself.)

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
