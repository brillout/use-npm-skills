What these tests cover — the sync run:

- A skill package with a root `SKILL.md` is copied into both default skills directories as a
  real directory (not a link) carrying the entry marker with package and version; no
  `.gitignore` is created; the summary line reports the result.
- The `skills/<dir>/SKILL.md` layout is supported.
- Scoped package naming: `@matt/grilling` → `npm-matt-grilling`.
- Nested `node_modules/` and `.git/` of a skill package are not copied; its other files are.
- Zero skill packages ⇒ zero side effects: no directories, no root postinstall hook. An
  installed dependency that does not depend on `use-npm-skills` is not a skill package.
- Zero skill packages with leftover managed entries: the leftovers are removed, the
  developer's own entries stay, and there are still no other side effects.
- A project without `node_modules/` (e.g. a fresh clone) never has its committed skills
  removed; the run points at the package manager's install instead.
- Re-runs are no-ops: entries reported up-to-date.
- A version change of an installed skill package refreshes the entries and their markers.
- Entries of uninstalled skill packages are removed; the others stay.
- Migration from v0.1: a leftover link is replaced by a committed copy; the former
  marker-file name is recognized and refreshed to the current one; the legacy `.gitignore`
  rule is removed with everything else preserved, and a `.gitignore` consisting only of the
  legacy rule is deleted.
- The `exclude` configuration skips listed packages and removes their existing entries.
- The `skillsDirs` configuration redirects the sync; the default directories stay untouched.
- Unknown configuration options produce a warning.
- When at least one skills directory already exists, only existing ones are synced into.
- An entry not managed by `use-npm-skills` is never overwritten — warned about and skipped.
- Packages without a `SKILL.md`, or with several skills, are skipped with a warning — and
  count as zero skill packages for the zero-side-effects rule.
- Yarn PnP: announced as unsupported, nothing happens, the run succeeds.
- CI: nothing happens, the run succeeds.
- Outside any project, the run fails with a clear message.
- Unknown command-line arguments fail with the usage text.
- The version option prints the version.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
