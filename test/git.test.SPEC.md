What these tests cover — the automated commit:

- The commit contains exactly the files the sync changed, is authored and committed as the
  bot identity `use-npm-skills <bot@npm:use-npm-skills>`, carries the undo and opt-out
  instructions plus the documentation link in its message, and leaves a clean working tree
  (managed entries being git-ignored).
- Re-runs never commit again.
- Files the developer staged are not swept into the commit and remain staged afterwards.
- A target file with preexisting uncommitted changes skips the commit — the changes are
  still applied, just left uncommitted.
- A detached HEAD skips the commit.
- A merge in progress skips the commit.
- The `gitCommit: false` configuration: changes applied, never committed.
- Outside a git repository: changes applied, commit skipped with a note.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
