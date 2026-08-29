The sync run — the tool's main operation: make the skills directories reflect the installed
skill packages, set up the automation that keeps it that way, commit what changed, and
announce all of it.

## User story

From the root `SPEC.md`:

- **Skills as dependencies** — the sync is what turns installed skill packages into skills
  agents can read.
- **Hands-off syncing** — the sync sets up its own future runs.
- **Trust and control** — nothing happens silently, and nothing happens at all without skill
  packages.

## Business logic — TL;DR

- **When a sync does nothing** — CI, global installs, Yarn PnP, no project, disabled
  postinstall automation (lifecycle runs only), or no target directories; each announced.
- **Zero skill packages ⇒ zero side effects** — nothing created or modified; only stale
  managed entries cleaned up.
- **The sync proper** — pick target directories, materialize entries, keep `.gitignore` and
  the root postinstall hook in shape, commit what changed.
- **Announcing** — every action, warning, and skip is reported, ending with a summary line.

## Business logic

### When a sync does nothing

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

Each of the following ends the run before anything is touched, announced, with the run
succeeding — except the one noted:

- CI (the `CI` environment variable): syncing is a development-machine concern.
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

With no skill packages installed, the sync creates no directories, edits no `.gitignore`,
adds no root postinstall hook, and commits nothing. The one thing it does: remove stale
managed entries left in already-existing skills directories by previously installed skill
packages. The output explains the situation — including the likely cause when
`node_modules/` is missing entirely (the package manager's install hasn't run yet).

### The sync proper

#### User story

Skills as dependencies, Hands-off syncing (root `SPEC.md`).

#### Business logic

With at least one skill package installed:

1. Target directories: every skills directory that already exists; if none exists yet, all
   of them are created and targeted (defaults: `.claude/skills` and `.agents/skills`;
   configurable via `skillsDirs`).
2. Which of `.gitignore` and `package.json` already have uncommitted changes is measured
   now — before anything is modified — so the automated commit can reliably stand down from
   files the developer was editing (see `src/git.SPEC.md`).
3. Skills are materialized: entries created or refreshed, stale ones removed, the copy
   fallback used where links cannot be created (see `src/materialize.SPEC.md`).
4. `.gitignore` is made to ignore the managed entries; on explicit runs, the root postinstall
   hook is added when the stamp proves it necessary (see `src/repoFiles.SPEC.md`).
5. What changed (`.gitignore`, `package.json`) is committed under the bot identity (see
   `src/git.SPEC.md`) — unless the `gitCommit: false` configuration is set or a skip reason
   applies, in which case the changes are left uncommitted and that is announced.

### Announcing

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

Everything the run does or decides is reported: configuration warnings, excluded and skipped
packages, unmanaged entries in the way, removals, the copy-fallback notice (with the advice
to re-run after updating skill packages), commit or commit-skip information (with undo and
opt-out instructions), and a closing summary line: how many skills were synced into which
directories, with counts of created, copied, up-to-date, removed, and skipped entries.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
