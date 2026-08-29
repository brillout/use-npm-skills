The sync run — the tool's main operation: make the skills directories reflect the installed
skill packages, commit the result, set up the automation that keeps it that way, and announce
all of it.

## User story

From the root `SPEC.md`:

- **Skills as dependencies** / **Skills in the repository** — the sync is what turns
  installed skill packages into committed skills agents can read.
- **Hands-off syncing** — the sync sets up its own future runs.
- **Trust and control** — nothing happens silently, nothing happens at all without skill
  packages, and the developer's own work never ends up inside an automated commit.

## Business logic — TL;DR

- **When a sync does nothing** — CI, global installs, Yarn PnP, no project, disabled
  postinstall automation (lifecycle runs only), or no target directories; each announced.
- **Zero skill packages ⇒ zero side effects** — nothing created or modified; only stale
  managed entries cleaned up, and not even that on a checkout that was never installed.
- **The sync proper** — pick target directories, materialize entries, clean up the legacy
  `.gitignore` rule, add the root postinstall hook when needed.
- **What gets committed** — everything the run changed, minus paths the developer had
  already modified, minus paths their `.gitignore` rules cover; managed entries that earlier
  runs could not commit are caught up.
- **Announcing** — every action, warning, and skip is reported, ending with a summary line.

## Business logic

### When a sync does nothing

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

Each of the following ends the run before anything is touched, announced, with the run
succeeding — except the one noted:

- CI (the `CI` environment variable): the checkout already contains the committed skills,
  and CI must not mutate the repository.
- A global install of `use-npm-skills`: there is no project to operate on.
- No project root can be found: a lifecycle run warns; an explicit run fails with a clear
  message (the one non-succeeding case).
- Yarn PnP: announced as unsupported.
- A lifecycle run while the `postinstall: false` configuration is set: postinstall automation
  is disabled; explicit runs still sync.
- The `skillsDirs` configuration is an empty list: no target directories, a warning says so.

### Zero skill packages ⇒ zero side effects

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- With no skill packages installed, the sync creates no directories, adds no root postinstall
  hook, and touches no project file. The one thing it does: remove stale managed entries left
  in already-existing skills directories by previously installed skill packages — removals of
  committed entries land as a commit like any other sync change.
- Exception to even that: when the project has no `node_modules/` at all, nothing is removed
  and the output says to run the package manager's install first. A missing `node_modules/`
  means "not installed yet" — e.g. a fresh clone whose committed skills must survive — not
  "packages uninstalled".

### The sync proper

#### User story

Skills as dependencies, Hands-off syncing (root `SPEC.md`).

#### Business logic

With at least one skill package installed:

1. Target directories: every skills directory that already exists; if none exists yet, all
   of them are created and targeted (defaults: `.claude/skills` and `.agents/skills`;
   configurable via `skillsDirs`).
2. The repository's uncommitted state under the paths the run may touch is measured now —
   before anything is modified — so hand-edited entries can be protected and developer
   changes kept out of the automated commit (see `src/git.SPEC.md`).
3. Skills are materialized: managed entries created or refreshed, stale ones removed,
   unmanaged and hand-edited ones left alone (see `src/materialize.SPEC.md`).
4. The legacy v0.1 `.gitignore` rule is removed if present; on explicit runs, the root
   postinstall hook is added when the stamp proves it necessary (see
   `src/repoFiles.SPEC.md`).

### What gets committed

#### User story

Skills in the repository, Trust and control (root `SPEC.md`).

#### Business logic

- The commit covers exactly what the run changed: managed entries created, refreshed, or
  removed, plus `.gitignore` (legacy-rule removal) and `package.json` (root postinstall
  hook) when the run changed them. Its title is `Add npm skills` when new entries were
  created, `Update npm skills` otherwise, and its message names the source packages and
  versions the committed content comes from.
- Kept out of the commit, each with an announcement:
  - `.gitignore` or `package.json` when the developer had uncommitted changes to them before
    the run — the run's own change is still applied, but committing it would sweep the
    developer's edits along; they review and commit themselves.
  - Paths covered by the developer's `.gitignore` rules — committed skills need them
    tracked, so the warning asks to remove the rule rather than forcing content past it.
  - The removal of an entry that was never committed (there is nothing to commit).
- Managed entries that are current but were never committed — an earlier run could not
  commit, e.g. before the repository existed or while automated commits were disabled — are
  caught up: they join the commit even though the run did not change them.
- The `gitCommit: false` configuration replaces the commit with an announcement listing what
  was left uncommitted; the skip conditions of `src/git.SPEC.md` do the same.

### Announcing

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

Everything the run does or decides is reported: configuration warnings, excluded and skipped
packages, unmanaged or hand-edited entries left alone, removals, commit or commit-skip
information (with undo and opt-out instructions), and a closing summary line: how many skills
were synced into which directories, with counts of created, updated, up-to-date, removed, and
skipped entries.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
