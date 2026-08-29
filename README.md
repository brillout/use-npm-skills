# `use-npm-skills`

Install [AI agent skills](https://agentskills.io) (`SKILL.md`) as npm packages.

Skills distributed this way are versioned by npm and pinned by your lockfile — installing,
updating, and removing them works with the package manager commands you already use, instead
of copying files from GitHub and updating them by hand.

```shell
npm install skill-awesome    # a skill package (any registry package that depends on use-npm-skills)
npx use-npm-skills           # done — the skill now lives in .claude/skills/ and .agents/skills/
```

```
.claude/skills/npm-skill-awesome -> ../../node_modules/skill-awesome
.agents/skills/npm-skill-awesome -> ../../node_modules/skill-awesome
```

- **Zero configuration, zero lock-in.** No config files, no registry, no service — just npm
  packages and one command. Remove the packages and the links are cleaned up.
- **Zero runtime dependencies.** `use-npm-skills` is a small, dependency-free package you can
  audit in minutes.
- **Versioned like the rest of your dependencies.** Skills are updated by `npm update`, pinned
  by your lockfile, auditable in your dependency tree.

Works with npm, pnpm, yarn, and Bun. (Yarn PnP is not supported.)

## Using skills

1. Install one or more skill packages: `npm install skill-awesome` (a skill package is a
   regular npm package — its only distinguishing feature is that it depends on
   `use-npm-skills`).
2. Run `npx use-npm-skills`.

That's it. From then on, skills stay in sync automatically (see below). Run
`npx use-npm-skills` again any time — it's idempotent — for example after adding or removing
skill packages.

### What `npx use-npm-skills` does

Everything it does is announced in its output, and each part can be disabled — see
[Configuration](#configuration).

1. **Links each installed skill package** into the project's agent skills directories. It
   syncs into whichever of `.claude/skills/` and `.agents/skills/` exist, and creates both if
   neither does. Entries are named `npm-<package-name>` (`@matt/grilling` →
   `npm-matt-grilling`): the `npm-` prefix marks them as managed by `use-npm-skills`, and
   naming by package name makes collisions impossible. Skills of uninstalled packages are
   removed; entries not managed by `use-npm-skills` are never touched.
2. **Adds `**/skills/npm-*` to your `.gitignore`.** The links are machine-local paths into
   `node_modules/` and must not be committed — they're recreated on any machine by
   `npx use-npm-skills` (or by the postinstall hook below).
3. **Adds `"postinstall": "npx use-npm-skills"` to your package.json** — only when needed:
   `use-npm-skills` ships its own postinstall script, but package managers don't reliably run
   dependency scripts (pnpm and Bun block them by default; npm doesn't re-run them on later
   installs), so this root hook keeps skills in sync on future installs. If you already have a
   `postinstall` script, `&& npx use-npm-skills` is appended and a warning asks you to
   double-check the merged script. Lifecycle runs never modify package.json — only explicit
   `npx use-npm-skills` runs do.
4. **Commits what it changed** (`.gitignore`, `package.json`) as a pathspec-scoped commit
   `Add npm skills`, authored by `use-npm-skills <bot@npm:use-npm-skills>` — never as you,
   never signed, never running your git hooks, and never sweeping your own staged or
   uncommitted changes along. The commit is skipped (and the changes left for you) if a file
   already had uncommitted modifications, in CI, on a detached HEAD, or during a
   merge/rebase/cherry-pick. Undo it while keeping its changes with `git reset HEAD~1`.

If no installed skill packages are found, `npx use-npm-skills` does nothing at all: no
directories, no `.gitignore` edit, no postinstall hook, no commit.

### Staying in sync

After the one-time `npx use-npm-skills`, installs keep skills in sync via the postinstall
hook and `use-npm-skills`' own install script. When exactly package managers fire these hooks
varies (see [the matrix below](#package-manager-support)) — the rule of thumb:

- A full install (fresh clone, `npm install` / `pnpm install` / `yarn` / `bun install`) always
  syncs.
- After adding or removing individual skill packages, run `npx use-npm-skills` if the package
  manager didn't already do it for you.

In CI, `use-npm-skills` always exits 0 without doing anything (`CI` environment variable set).

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
  "dependencies": { "use-npm-skills": "^0.1.0" }
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
    "exclude": ["skill-noisy"],        // installed skill packages to skip
    "neverCopy": true                  // never fall back to copying when linking fails (default: false)
  }
}
```

- `postinstall: false` — `npx use-npm-skills` won't add the postinstall hook, and lifecycle
  runs (from any already-present hook or from `use-npm-skills`' own install script) do
  nothing. Explicit `npx use-npm-skills` runs still sync.
- `gitCommit: false` — changes to `.gitignore`/`package.json` are still made, but left
  uncommitted for you to review and commit.
- `exclude` — the listed packages' skills are skipped (and removed if previously linked).
- `neverCopy` — on systems where links can't be created, skills are normally materialized as
  managed copies; this disables the fallback.

## How it works

- **Discovery**: the project root is the nearest directory with a lockfile (in workspaces:
  the monorepo root). Top-level `node_modules/*` and `node_modules/@*/*` package.jsons are
  scanned for a dependency on `use-npm-skills` — skill packages are direct dependencies, so
  this works on pnpm's strict layout too, and no lockfile parsing is needed.
- **Links**: relative symlinks on POSIX; junctions on Windows (directory links that need no
  privilege). Link targets are the logical `node_modules/<pkg>` paths — never resolved to
  their real paths, which on pnpm would bake in versioned store paths that dangle on every
  upgrade. Where links can't be created (e.g. exotic file systems), skills are copied instead
  and a `.use-npm-skills-copy.json` marker makes the copies refreshable/removable.
- **Install-script detection**: `use-npm-skills`' own postinstall writes a stamp file
  (`node_modules/.use-npm-skills/stamp`). On explicit runs, a stamp that is absent or older
  than the lockfile means the last install didn't run the script — that's when the
  `"postinstall": "npx use-npm-skills"` hook is added to package.json.

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

**Why the `npm-` prefix on skill directory names?**
It marks entries as managed by `use-npm-skills`: those are the only entries it will ever
create, update, or remove, so your own skills in the same directories are never touched. It
also makes the single `.gitignore` pattern `**/skills/npm-*` possible.

**The skill name agents see** comes from the `name` field in the skill's `SKILL.md`
frontmatter — not from the `npm-*` directory name.

**How do I update skills?** `npm update` (or your package manager's equivalent) — skills are
regular dependencies. On package managers that don't re-fire hooks for targeted updates, run
`npx use-npm-skills` afterwards (only needed if the skill package's location changed;
links point at `node_modules`, so in-place updates are picked up automatically).

**How do I remove a skill?** `npm uninstall skill-awesome`, then `npx use-npm-skills` (or the
next full install) removes its links.

**How do I stop using use-npm-skills entirely?** Uninstall the skill packages, run
`npx use-npm-skills` once (it cleans up its links), then remove the `postinstall` script and
the `.gitignore` line it added.

**Bun without Node?** The postinstall hook runs `npx`, which ships with Node/npm. In a
Bun-only environment, change the hook to `bunx use-npm-skills` yourself (and set
`"use-npm-skills": { "postinstall": false }` so it isn't re-added).

## Prior art

- [antfu/skills-npm](https://github.com/antfu/skills-npm) and [skills.sh](https://skills.sh)
  distribute skills by copying them from GitHub repos — updates are manual and unversioned.
  `use-npm-skills` distributes skills as npm packages: versioned, lockfiled, updated by your
  package manager.
- [`npm-skills`](https://www.npmjs.com/package/npm-skills) is an adjacent, unrelated package
  (skill extraction, not distribution).
