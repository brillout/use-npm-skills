# `use-npm-skills`

Install [AI agent skills](https://agentskills.io) (`SKILL.md`) as npm packages — committed
into your repo.

npm distributes and versions the skills; your repo carries them. Installing, updating, and
removing skills works with the package manager commands you already use, every skill change
lands as a reviewable commit, and agents see the skills on any checkout — no install, no
setup, no network.

```shell
npm install skill-awesome    # a skill package (any registry package that depends on use-npm-skills)
npx use-npm-skills           # done — the skill now lives in .claude/skills/ and .agents/skills/
```

```
.claude/skills/npm-skill-awesome/SKILL.md    # committed to your repo
.agents/skills/npm-skill-awesome/SKILL.md
```

- **Always there for agents.** Agents mostly read repos from fresh checkouts without running
  an install — anything that only exists after `npm install` is invisible to them. Committed
  skills are simply part of the checkout.
- **Versioned like the rest of your dependencies.** Skills are updated by `npm update`,
  pinned by your lockfile, auditable in your dependency tree — and every content change shows
  up as a diff naming the package and version it came from.
- **Zero configuration, zero lock-in.** No config files, no registry, no service.
  `use-npm-skills` itself is a small, dependency-free package; stop using it and your repo
  simply keeps the skills it has.

Works with npm, pnpm, yarn, and Bun. (Yarn PnP is not supported.)

## Using skills

1. Install one or more skill packages: `npm install skill-awesome` (a skill package is a
   regular npm package — its only distinguishing feature is that it depends on
   `use-npm-skills`).
2. Run `npx use-npm-skills`.

That's it. From then on, skills stay in sync automatically (see below). Run
`npx use-npm-skills` again any time — it's idempotent — for example after adding, updating,
or removing skill packages.

### What `npx use-npm-skills` does

Everything it does is announced in its output, and each part can be disabled — see
[Configuration](#configuration).

1. **Copies each installed skill package's skill** into the project's agent skills
   directories. It syncs into whichever of `.claude/skills/` and `.agents/skills/` exist, and
   creates both if neither does. Entries are named `npm-<package-name>`
   (`@matt/grilling` → `npm-matt-grilling`): the `npm-` prefix marks them as managed by
   `use-npm-skills`, and naming by package name makes collisions impossible. Each entry
   carries a `.use-npm-skills.json` marker recording which package and version it holds.
   Entries are refreshed when the installed version changes and removed when their package is
   uninstalled; anything not managed by `use-npm-skills` — including your own skills in the
   same directories — is never touched.
2. **Adds `"postinstall": "npx use-npm-skills"` to your package.json** — only when needed:
   `use-npm-skills` ships its own postinstall script, but package managers don't reliably run
   dependency scripts (pnpm and Bun block them by default; npm doesn't re-run them on later
   installs), so this root hook keeps skills in sync on future installs. If you already have
   a `postinstall` script, `&& npx use-npm-skills` is appended and a warning asks you to
   double-check the merged script. Lifecycle runs never modify package.json — only explicit
   `npx use-npm-skills` runs do.
3. **Commits what it changed** — the skill content and, when modified, `package.json` — as a
   pathspec-scoped commit (`Add npm skills` / `Update npm skills`) authored by
   `use-npm-skills <bot@npm:use-npm-skills>`: never as you, never signed, never running your
   git hooks, never sweeping your own staged or uncommitted changes along, and always naming
   the skill packages (with versions) the content comes from. Files you had already modified
   are left out of the commit for you to review; the commit is skipped entirely in CI, on a
   detached HEAD, or during a merge/rebase/cherry-pick. Undo a commit while keeping its
   changes with `git reset HEAD~1`.

If no installed skill packages are found, `npx use-npm-skills` does nothing at all: no
directories, no postinstall hook, no commit. And if `node_modules/` is missing entirely — a
fresh clone, say — it never removes anything: committed skills survive a run before the
install.

### Staying in sync

After the one-time `npx use-npm-skills`, installs keep the committed skills following the
installed packages via the postinstall hook and `use-npm-skills`' own install script. When
exactly package managers fire these hooks varies (see
[the matrix below](#package-manager-support)) — the rule of thumb:

- A full install (`npm install` / `pnpm install` / `yarn` / `bun install`) always syncs.
- After adding, updating, or removing individual skill packages, run `npx use-npm-skills` if
  the package manager didn't already do it for you. This matters especially for dependency
  bots (Renovate, Dependabot): they bump the lockfile but don't run the sync, so the
  committed skills catch up on the next sync after merging — or add `npx use-npm-skills` to
  the bot's post-upgrade tasks.
- Fresh checkouts need nothing: the skills are already in the repo.

In CI, `use-npm-skills` always exits 0 without doing anything (`CI` environment variable
set) — the checkout already contains the skills, and CI shouldn't mutate the repo.

### Rules of the committed skills

- **Don't edit `npm-*` entries by hand** — they're managed copies, replaced wholesale when
  the package updates. If you do edit one, `use-npm-skills` notices (uncommitted changes to
  tracked content) and refuses to overwrite or remove it until you revert the edits
  (`git checkout -- <path>`) or exclude the package. To change a skill for good, change the
  skill package — or copy the content into a skill directory of your own (any name without
  the `npm-` prefix).
- **Merge conflicts inside `npm-*` entries** (two branches synced different versions): don't
  resolve them by hand — delete the conflicted entry and re-run `npx use-npm-skills`; it
  rewrites the entry from the installed version.
- **Don't gitignore the skills directories** — committed skills need to be tracked;
  `use-npm-skills` warns when a `.gitignore` rule covers them (and automatically removes the
  rule its own v0.1 used to maintain).

### Monorepos

Skills apply repo-wide and should therefore be installed at the monorepo root.
`use-npm-skills` operates at the workspace root (where the lockfile lives): install skill
packages as root dependencies (e.g. `pnpm add -w skill-awesome`), and the skills directories
are created at the root — no matter which workspace directory you run it from.

## Authoring a skill package

A skill package is a normal npm package that:

1. contains a `SKILL.md` at its root — or exactly one `skills/<dir>/SKILL.md`
   (one package = one skill; publish collections as multiple packages);
2. depends on `use-npm-skills` (that dependency is the marker that makes it discoverable —
   there's no special package.json field or keyword).

Scaffold one:

```shell
mkdir skill-awesome && cd skill-awesome
npx use-npm-skills init
# fill in SKILL.md, then:
npm publish
```

`init` creates:

```jsonc
// package.json
{
  "name": "skill-awesome",
  "version": "0.1.0",
  "files": ["SKILL.md"],
  "dependencies": { "use-npm-skills": "^0.2.0" }
}
```

```markdown
---
name: skill-awesome
description: What this skill does and when an agent should use it.
---

# skill-awesome

The skill's instructions.
```

Users then get your skill with `npm install skill-awesome && npx use-npm-skills`, and updates
with `npm update`.

## Configuration

All optional, under `use-npm-skills` in the project root package.json:

```jsonc
{
  "use-npm-skills": {
    "postinstall": false,              // never add nor act on postinstall automation (default: true)
    "gitCommit": false,                // never make git commits (default: true)
    "skillsDirs": [".claude/skills"],  // target dirs (default: [".claude/skills", ".agents/skills"])
    "exclude": ["skill-noisy"]         // installed skill packages to skip
  }
}
```

- `postinstall: false` — `npx use-npm-skills` won't add the postinstall hook, and lifecycle
  runs (from any already-present hook or from `use-npm-skills`' own install script) do
  nothing. Explicit `npx use-npm-skills` runs still sync.
- `gitCommit: false` — skills are still synced, but nothing is committed; the changes are
  left for you to review and commit. (A later run with commits re-enabled catches up on
  entries that were left uncommitted.)
- `exclude` — the listed packages' skills are skipped (and removed if previously synced).

## How it works

- **Discovery**: the project root is the nearest directory with a lockfile (in workspaces:
  the monorepo root). Top-level `node_modules/*` and `node_modules/@*/*` package.jsons are
  scanned for a dependency on `use-npm-skills` — skill packages are direct dependencies, so
  this works on pnpm's strict layout too, and no lockfile parsing is needed.
- **Materialization**: plain directory copies (nested `node_modules/` and `.git/` excluded),
  each carrying a `.use-npm-skills.json` marker with the source package and version — the
  marker is what makes an entry refreshable and removable, and versions are how re-runs stay
  no-ops.
- **Install-script detection**: `use-npm-skills`' own postinstall writes a stamp file
  (`node_modules/.use-npm-skills/stamp`). On explicit runs, a stamp that is absent or older
  than the lockfile means the last install didn't run the script — that's when the
  `"postinstall": "npx use-npm-skills"` hook is added to package.json.
- **Migrating from v0.1**: v0.1 materialized skills as gitignored symlinks/junctions into
  `node_modules/`. The first v0.2 sync replaces the links with committed copies and removes
  the `**/skills/npm-*` rule v0.1 added to `.gitignore`.

### Package manager support

Measured behavior (npm 10, pnpm 10, yarn 1, Bun 1.4):

| | `use-npm-skills`' own install script | root `postinstall` hook fires on |
|---|---|---|
| npm | runs on first install | full install |
| pnpm | blocked by default | full install (recent pnpm 10 no longer fires it on `pnpm add`) |
| yarn 1 | runs | install and `yarn add` |
| Bun | blocked by default | install, `bun add`, and `bun remove` |
| Yarn PnP | — | not supported (`use-npm-skills` prints a note and exits 0) |

## FAQ

**Why commit the skills instead of linking into `node_modules/`?**
Because the consumers are agents, and agents read repos at times when `node_modules/` doesn't
exist: fresh checkouts, review sessions, sandboxes, CI. A skill that requires
install-plus-sync to appear is invisible in exactly those sessions — silently. Committed
skills are always there, and their updates become reviewable diffs.

**Why the `npm-` prefix on skill directory names?**
It marks entries as managed by `use-npm-skills`: those are the only entries it will ever
create, update, or remove, so your own skills in the same directories are never touched.

**The skill name agents see** comes from the `name` field in the skill's `SKILL.md`
frontmatter — not from the `npm-*` directory name.

**How do I update skills?** `npm update` (or your package manager's equivalent), then
`npx use-npm-skills` if no install hook fired — the refresh lands as an
`Update npm skills` commit.

**How do I remove a skill?** `npm uninstall skill-awesome`, then `npx use-npm-skills` (or the
next full install) removes its entry — as a commit.

**How do I stop using use-npm-skills entirely?** Uninstall the skill packages and run
`npx use-npm-skills` once (it removes its entries), then remove the `postinstall` script.
Or keep the committed skills and just remove the packages and the hook — the content is
yours.

**Bun without Node?** The postinstall hook runs `npx`, which ships with Node/npm. In a
Bun-only environment, change the hook to `bunx use-npm-skills` yourself (and set
`"use-npm-skills": { "postinstall": false }` so it isn't re-added).

## Prior art

- [antfu/skills-npm](https://github.com/antfu/skills-npm) and [skills.sh](https://skills.sh)
  also put skill files into your project, but source them by copying from GitHub repos —
  updates are manual and unversioned. `use-npm-skills` sources skills from npm packages:
  versioned, lockfile-pinned, updated by your package manager, with each update landing as an
  attributable commit.
- [`npm-skills`](https://www.npmjs.com/package/npm-skills) is an adjacent, unrelated package
  (skill extraction, not distribution).
