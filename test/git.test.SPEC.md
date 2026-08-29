What these tests cover — the automated commit:

- The commit contains exactly the paths the sync changed — the managed entries' files and
  `package.json` — is authored and committed as the bot identity
  `use-npm-skills <bot@npm:use-npm-skills>`, names the source packages and versions in its
  message alongside the undo and opt-out instructions and the documentation link, and leaves
  a clean working tree.
- Re-runs never commit again.
- A skill package update lands as an `Update npm skills` commit naming the new version, and
  an uninstall as a committed removal — each leaving a clean tree.
- Files the developer staged are not swept into the commit and remain staged afterwards.
- A `package.json` with preexisting uncommitted changes stays out of the commit (announced),
  while the skill content is still committed; the run's `package.json` change is still
  applied.
- Hand-edited committed skill content is never overwritten: the entry is skipped with a
  warning while its untouched twin in the other skills directory is updated and committed.
- A detached HEAD and a merge in progress each skip the commit entirely — changes applied,
  left uncommitted.
- The `gitCommit: false` configuration: changes applied, never committed; once re-enabled, a
  later run commits the managed entries earlier runs left uncommitted.
- A skills directory covered by the developer's `.gitignore` rules is warned about and kept
  out of the commit; unignored directories are still committed.
- Outside a git repository: changes applied, commit skipped with a note.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
