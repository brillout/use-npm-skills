`use-npm-skills` makes npm the distribution channel for AI-agent skills (the [agentskills.io](https://agentskills.io) `SKILL.md` convention). Skill authors publish skills as normal npm packages — a dedicated skill package, or a library shipping the skills for using it — and projects then install, version, update, and remove skills through their package manager like any dependency. Running `npx use-npm-skills` materializes [2] the skills of all installed skill packages [1] into the project's skills directories [3] (e.g. `.agents/skills/`, `.claude/skills/`) — each skill as a committed symlink to its directory inside the package — and removes the skills of packages that were uninstalled.

The repository has two top-level subsystems:

- `src/` — the product itself: the `npx use-npm-skills` command and the sync flow behind it (see `src/SPEC.md`).
- `test/` — the automated tests (see `test/SPEC.md` for what they cover).

## User stories

- **Skill author** — I publish and maintain a skill as a normal npm package: semver releases and deprecations come from npm itself. Optionally, my package installs its skills by itself through its own lifecycle scripts.
- **Library author** — I ship the skills for using my library inside the library's own npm package, so they are versioned and updated together with the code they describe.
- **Developer** — I get skills like any dependency: install the package, run `npx use-npm-skills`, and the skill shows up where my AI agents look for skills. Upgrading is `npm update` alone — the skill follows the installed version — and the package manager's lockfile pins exactly which skill content my whole team has.
- **Developer** — skills I wrote myself are never touched, whatever packages I install.
- **Developer** — if I forgot to run the tool after adding or removing skill packages, the next install of a package with lifecycle scripts tells me, and CI fails.
- **AI agent** — in a checkout whose dependencies are installed, I see every skill in the skills directories.

## Problems

- Skills are traditionally distributed by copy-paste: installers clone files from GitHub into the repository, updates are manual, and nothing ties the skill you have to a version anyone can name. npm already solves all of this for code — semver, lockfiles, updates, deprecations — so skills should get the same treatment.

## Glossary

[1] skill package: an npm package that ships one or more skills, each a subdirectory of its `skills/` directory (by the agentskills.io convention, one holding a `SKILL.md`). The `skills/` directory is the only marker — there is no keyword or manifest field — so any package following the antfu/skills-npm convention is a skill package. A dedicated skill package ships one skill; a library can ship the skills for using it alongside its code.

[2] materialize: make a skill shipped by a skill package [1] appear in the project's skills directories — by default as a symlink to the skill's directory inside the package (symlink mode); alternatively, as a copy of its files (copy mode, a setting).

[3] skills directory: a directory where AI agents look for skills — a directory whose entries are skills, each a subdirectory containing a `SKILL.md` (per the agentskills.io convention), e.g. `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`.

## Business logic — TL;DR

- **Skills as npm dependencies** - a skill package [1] is a normal npm package recognized by its `skills/` directory; it delivers one skill or several.
- **Explicit sync, optional package hooks** - the user runs `npx use-npm-skills` after adding or removing skill packages; the tool installs no lifecycle hooks of its own, but a skill package may run `install-package` / `uninstall-package` from its own lifecycle scripts, acting on that package alone.
- **Symlinked materialization** - each materialized [2] skill is a relative symlink into the package, committed with the repository, so updating the package updates the skill; a copy mode exists as a setting.
- **User content is inviolable** - anything in a skills directory the tool did not create is left alone.

## Business logic

### Skills as npm dependencies

#### User story

Skill author, Library author, Developer (see `## User stories`).

#### Business logic

A skill package [1] is any installed npm dependency — of the repository root or of any workspace package in it — with a `skills/` directory holding at least one subdirectory. Each subdirectory is a skill, and everything an npm package supports — semver ranges, lockfile pinning, `npm update`, deprecation — applies to the skills unchanged.

#### Rationale

Reusing npm instead of a bespoke registry means authors and users keep the tooling and guarantees they already have. Making the `skills/` directory the only marker — the rule [antfu/skills-npm](https://github.com/antfu/skills-npm) established — means a package written for either tool works with both, without its author opting in. Allowing several skills per package lets a library ship the skills for using it inside the library itself, so a skill and the code it describes are always the same version.

### Explicit sync, optional package hooks

#### User story

Skill author, Developer (see `## User stories`).

#### Business logic

The tool itself does nothing automatically: it ships zero lifecycle scripts and never installs hooks; the user runs `npx use-npm-skills` after adding or removing skill packages (updating one needs no run: the skill's symlink follows the installed version). A skill package may declare `postinstall` and `uninstall` scripts running `use-npm-skills install-package` and `use-npm-skills uninstall-package` (see `src/hooks.SPEC.md`), which install or remove that one package's skills as part of the package manager's install — and report, without fixing them, other packages' skills that are out of sync.

#### Rationale

Package-manager lifecycle events are structurally unreliable: dependency postinstall scripts are blocked by default on pnpm and Bun and don't re-run on skill updates on npm; few package managers fire anything on uninstall; targeted `npm update <pkg>` / `npm install <pkg>` fire no root hooks either. Half-working automation is worse than none, so the explicit command stays the one that brings everything in sync; a package's own hooks are opt-in, act on that package alone, and are a convenience layered on top. The tool being script-free is also a trust feature: no build-approval prompts, nothing for supply-chain scanners to flag.

### Symlinked materialization

#### User story

Developer, AI agent (see `## User stories`).

#### Business logic

By default (symlink mode), a skill is materialized [2] as a relative symlink from the skills directory to the skill's directory inside its package — in every skills directory the project has (see `src/packageLink.SPEC.md`). The link goes through the package's top-level `node_modules/<package>/` path, which stays the same when the package is updated, so an update needs no run of the tool: the link shows whatever version is installed. The links are meant to be committed; on a fresh clone they resolve as soon as the project's dependencies are installed. In copy mode — the `mode` setting of the config file (see `src/config.SPEC.md`) — skills are instead copied into the skills directories as real files, each carrying a `source.json` metadata file recording which package and version it came from; on Windows machines where symlinks are unavailable, copy mode is used automatically.

#### Rationale

The repository holds no copy of skill content, so nothing can drift from the installed package, updating a package updates its skills, and each link shows where a skill comes from. The price — a fresh clone's links dangle until dependencies are installed — is accepted: installing dependencies is the step every clone takes before an agent works in it. Copy mode is kept for environments without symlinks and for projects that want the skill files in the repository.

### User content is inviolable

#### User story

Developer (see `## User stories`).

#### Business logic

Anything in a skills directory that the tool did not create — a hand-written skill, a plain file, a symlink of the user's own — is never modified or deleted; when it stands where a package's skill would go, that skill is skipped with a warning, and the user's entry wins. In copy mode, copies the user edited locally are detected via a content hash and left untouched — the tool tells the user how to keep the changes permanently or how to overwrite them explicitly with `--force` — and when a skill package is uninstalled, its unmodified copy is removed, but a locally edited one is kept and becomes the user's own.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
