What these tests cover — the sync run:

- A skill package with a root `SKILL.md` is linked into both default skills directories, the
  ignore pattern is added to `.gitignore`, and the summary line reports the result.
- Links are relative and point at the logical `node_modules/` location — never at a
  versioned store path.
- The `skills/<dir>/SKILL.md` layout is supported.
- Scoped package naming: `@matt/grilling` → `npm-matt-grilling`.
- Zero skill packages ⇒ zero side effects: no directories, no `.gitignore`, no root
  postinstall hook. An installed dependency that does not depend on `use-npm-skills` is not
  a skill package.
- Zero skill packages with leftover managed entries: the leftovers are removed, the
  developer's own entries stay, and there are still no other side effects.
- Re-runs are no-ops: entries reported up-to-date, no duplicated `.gitignore` line.
- Entries of uninstalled skill packages are removed; the others stay.
- The `exclude` configuration skips listed packages and removes their existing entries.
- The `skillsDirs` configuration redirects the sync: the default directories stay untouched
  and the matching ignore line is used.
- Unknown configuration options produce a warning.
- When at least one skills directory already exists, only existing ones are synced into.
- An entry not managed by `use-npm-skills` is never overwritten — warned about and skipped.
- Packages without a `SKILL.md`, or with several skills, are skipped with a warning — and
  count as zero skill packages for the zero-side-effects rule.
- A managed link pointing at the wrong target is replaced.
- The copy fallback when links cannot be created: copies carry the copy marker (package and
  version), a re-run with the same version reports up-to-date, a version change refreshes
  the copies.
- The `neverCopy` configuration: a warning and a skip instead of a copy.
- Yarn PnP: announced as unsupported, nothing happens, the run succeeds.
- CI: nothing happens, the run succeeds.
- Outside any project, the run fails with a clear message.
- Unknown command-line arguments fail with the usage text.
- The version option prints the version.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
