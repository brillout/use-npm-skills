`use-npm-skills` distributes AI agent skills as npm packages. A developer installs a skill
package with their package manager; `use-npm-skills` copies the skill into the project's
skills directories and commits it, where coding agents pick it up, and keeps those
directories in sync with the installed packages from then on. Skills thereby get what every
npm dependency has — a version, lockfile pinning, and installing, updating, and removing
through the package manager — while living in the repository itself: agents see them on any
checkout, with no install and no setup. npm, pnpm, yarn 1, and Bun are supported; Yarn PnP is
unsupported (announced, and the run succeeds without doing anything).

Top-level structure — two entry points, one engine:

- `cli.js` — the command-line interface, for explicit runs: `npx use-npm-skills` (sync the
  project) and `npx use-npm-skills init` (scaffold a skill package).
- `postinstall.js` — the lifecycle entry point: runs while a package manager installs
  `use-npm-skills` itself, which is what makes installing skill packages sync on its own.
- `src/` — the engine both entry points delegate to: discovering skill packages, syncing the
  skills directories, keeping `package.json` in shape, committing what changed, scaffolding.
- `test/` — covers all of the above.

## User story

- **Skills as dependencies** — A developer adds an AI agent skill to their project with their
  package manager (`npm install skill-awesome`), runs `npx use-npm-skills` once, and every
  agent reading the project's skills directories can use the skill. Versioning, lockfile
  pinning, updating, and removal work like for any other dependency.
- **Skills in the repository** — Skills are part of the repository: an agent (or teammate) on
  a fresh checkout has them immediately — no install, no network, no setup — and every skill
  change arrives as a reviewable commit.
- **Hands-off syncing** — After the one-time `npx use-npm-skills`, the committed skills
  follow the installed skill packages automatically: future installs sync without the
  developer running anything extra.
- **Publishing skills** — A skill author turns a skill into an npm package with minimal
  ceremony and publishes it like any other package; consumers get it — and its updates — from
  the npm registry.
- **Trust and control** — Everything the tool does on its own is announced, undoable, and can
  be disabled; it never breaks a package manager install, never alters files it does not
  manage, and never mixes its changes into the developer's own work.

## Glossary

- **skill** — an instruction package for AI coding agents per the `SKILL.md` convention
  (https://agentskills.io): a directory whose `SKILL.md` carries name/description frontmatter
  and the instructions agents read.
- **skill package** — a regular npm package that ships one skill and declares a dependency on
  `use-npm-skills`; that dependency is the one and only marker making the package discoverable
  as a skill package.
- **skills directory** — a directory agents read skills from; by default `.claude/skills/`
  and `.agents/skills/` at the project root (configurable).
- **managed entry** — an entry `use-npm-skills` creates in a skills directory, named
  `npm-<package name>`: a directory holding a copy of the skill, committed to version
  control. Managed entries are the only entries `use-npm-skills` ever creates, updates, or
  removes.
- **entry marker** — a file inside every managed entry recording the source package and
  version; it is what marks the entry as managed, allowing later runs to refresh or remove
  it.
- **project root** — the directory `use-npm-skills` operates on: the nearest ancestor
  directory containing a lockfile — in a monorepo, the workspace root.
- **lifecycle run** — a run of `use-npm-skills` started by a package manager as part of an
  install. Lifecycle runs never modify `package.json` and never fail the install.
- **explicit run** — a run the developer starts themself (`npx use-npm-skills`).
- **stamp** — a file (`node_modules/.use-npm-skills/stamp`) written by `use-npm-skills`' own
  install script; its existence and freshness prove that the package manager runs dependency
  install scripts.
- **root postinstall hook** — the `"postinstall": "npx use-npm-skills"` script
  `use-npm-skills` adds to the project's `package.json` so future installs keep skills in
  sync.

## Business logic — TL;DR

- **Skills as npm packages, committed to the repository** — installed skill packages
  (recognized by their dependency on `use-npm-skills`) are copied into every skills directory
  as managed entries and committed; updates refresh the entries, uninstalling removes them —
  each landing as a commit.
- **Staying in sync automatically** — `use-npm-skills`' own install script syncs during
  installs; where package managers don't run it, an explicit run adds the root postinstall
  hook — the stamp tells which situation the project is in. Fresh checkouts need no syncing
  at all: the skills are already in the repository.
- **Authoring skill packages** — `npx use-npm-skills init` scaffolds a publishable skill
  package; one package = one skill.
- **Safety and control** — zero skill packages ⇒ zero side effects; unmanaged files and
  hand-edited skill content are never touched; installs never fail; changes are committed as
  a tightly scoped bot commit or left for review; every automation can be disabled.

## Business logic

### Skills as npm packages, committed to the repository

#### User story

Skills as dependencies, Skills in the repository (see `## User story`).

#### Business logic

- What makes a package a skill package is a single marker: it depends on `use-npm-skills`.
  No registry, no service, no special `package.json` field — any published npm package
  carrying the dependency and one skill qualifies.
- Syncing copies every installed skill package's skill into every skills directory as a
  managed entry named `npm-<package name>`, and commits it. A managed entry is refreshed when
  its package's installed version changes, and removed when its package is uninstalled — each
  as a commit of its own. The package manager remains the interface for everything: install,
  pin, update, remove, audit.
- Because managed entries are committed, every checkout of the repository carries the skills:
  agents need no install and no `use-npm-skills` run to see them. The npm side governs
  distribution and updates; the repository governs presence.
- In a monorepo, skills apply repo-wide: everything happens at the workspace root, no matter
  which workspace directory a run starts from; skill packages are meant to be installed as
  root dependencies.

#### Rationale

- Committing the skills is what makes them reach the primary consumer: agents routinely read
  repositories from fresh checkouts without ever running an install (answering questions,
  reviewing, working in sandboxes). Content that only exists after an install-plus-sync would
  be invisible in exactly those sessions — and invisibly so.
- The commits double as a review trail: what an agent will be instructed to do changes only
  through a visible, attributable diff.
- Naming entries by package name makes name collisions between skill packages all but
  impossible (npm names are unique), and the `npm-` prefix marks the entries as managed.
  Neither affects agents: the skill name agents see comes from the skill's own `SKILL.md`
  frontmatter, not from the entry name.

### Staying in sync automatically

#### User story

Hands-off syncing (see `## User story`).

#### Business logic

Two mechanisms keep the committed skills following the installed packages, because package
managers differ in which install scripts they run:

1. `use-npm-skills`' own install script (see `postinstall.SPEC.md`) syncs whenever the
   package manager installs `use-npm-skills` — and records that it ran by writing the stamp.
2. The root postinstall hook makes every future install of the project sync. An explicit run
   adds the hook only when the stamp proves it necessary: a stamp that is absent or older
   than the lockfile means the last install did not run dependency install scripts (pnpm and
   Bun block them by default; npm does not re-run them on later installs).

The resulting rule of thumb: a full install always syncs; after adding, updating, or removing
individual skill packages, an explicit run covers the package managers that fire no hook for
that. Checkouts that never install need nothing: the skills are already committed.

In CI (the `CI` environment variable is set), every run does nothing and succeeds — the
checkout already contains the skills, and CI must not mutate the repository.

### Authoring skill packages

#### User story

Publishing skills (see `## User story`).

#### Business logic

`npx use-npm-skills init` turns the current directory into a publishable skill package: a
`package.json` carrying the `use-npm-skills` dependency (the marker) and a `SKILL.md` to fill
in (see `src/init.SPEC.md`). One package = one skill — a package offering several skills is
rejected at sync time; collections are published as multiple packages.

### Safety and control

#### User story

Trust and control (see `## User story`).

#### Business logic

- Zero installed skill packages ⇒ zero side effects: nothing is created or modified; only
  leftovers of previously installed skill packages are cleaned up. And when `node_modules/`
  is missing entirely — an uninstalled checkout, not an uninstalled package — nothing is
  removed either: committed skills survive runs on fresh clones.
- Only managed entries are ever created, updated, or removed — and among those, never one
  whose committed content the developer has hand-edited (uncommitted changes to tracked
  content). Anything else occupying a spot in a skills directory — even one occupying a
  managed name — is left untouched and warned about.
- A run that may be part of a package manager install never fails that install and never
  modifies `package.json`.
- What a sync changes — managed entries, `package.json` — is committed under a bot identity,
  restricted to exactly those paths, with the source packages named in the commit message.
  Paths the developer had already modified before the run stay out of the commit, left for
  their review; repository states a commit would disturb skip the commit entirely (see
  `src/git.SPEC.md`).
- Every action is announced in the output, with undo and opt-out instructions where they
  apply; configuration can disable each automation individually: postinstall automation,
  automated commits, the target directories, individual packages (see
  `src/context.SPEC.md`).

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
