Finds the skills of the installed skill packages [1]: which of the project's installed npm packages ship skills, and which skills — by name and location — each of them ships.

## Glossary

[1] skill package: an installed npm package with a `skills/` directory holding at least one subdirectory; each subdirectory is a skill.

## Business logic — TL;DR

- **The skills/ directory is the only marker** - any top-level package of any `node_modules/` in the repository whose `skills/` directory has at least one subdirectory is a skill package [1]; no keyword or manifest field is involved.
- **Every subdirectory of skills/ is a skill, taken as-is** - a package ships any number of skills; each subdirectory is a skill named after itself, nothing about it is validated and nothing is warned about; files directly in `skills/` are ignored.

## Business logic

### The skills/ directory is the only marker

#### User story

The skill author ships a `skills/` directory and it works — the same convention as antfu/skills-npm, so a package written for either tool works with both; developers add such packages like any other dependency, and in a monorepo a workspace package's dependencies count just like the root's.

#### Business logic

Every top-level package — scoped packages (`@scope/name`) included — of every `node_modules/` directory in the repository that has a readable `package.json` and a `skills/` directory containing at least one subdirectory is a skill package [1]. The `node_modules/` directories are found by crawling the tree from the project root (`resolveRoot.SPEC.md`): the root's own and any nested one (a workspace package's, or another project's in the same repository, at any depth) — but never a `node_modules/` inside another `node_modules/`, which is a dependency's own tree, and never anything inside `.git/`; symbolic links are not followed. Nothing else marks a package: keywords and other `package.json` fields play no role, and there is no lockfile or workspace-definition parsing. The `node_modules/` directories are processed root first, then in path order; within each, packages in alphabetical order of their name, and each package's skills in alphabetical order of their name — which makes every later "first one wins" rule deterministic. A package present in several `node_modules/` directories counts once: the first copy that ships skills wins. No `node_modules/` anywhere under the project root is a usage error telling the user to install dependencies first.

#### Rationale

The layout is the marker [antfu/skills-npm](https://github.com/antfu/skills-npm) established (`node_modules/*/skills/*/SKILL.md`); requiring nothing else means every package built for skills-npm works with this tool as-is, without its author opting in. Package managers install a workspace package's dependencies in that package's own `node_modules/` — pnpm never hoists them to the root — so scanning only the root's `node_modules/` misses every skill package that a workspace package depends on ([antfu/skills-npm#34](https://github.com/antfu/skills-npm/issues/34)); crawling the tree instead of parsing workspace definitions keeps the tool package-manager-agnostic and also covers nested projects that are not declared as workspaces. Within one `node_modules/`, its top-level packages are the direct dependencies of that project, which is all a skill package can be. A dependency whose `skills/` directory is not meant for the user's agents is silenced with the config file's `exclude` (see `sync.SPEC.md`).

### Every subdirectory of skills/ is a skill, taken as-is

#### User story

The skill author puts each skill the package ships — its `SKILL.md`, plus any reference docs, scripts, templates — into its own subdirectory of the package's `skills/` directory. A library author ships the skills for using the library the same way, next to the library's code, so skills and code are versioned together.

#### Business logic

Every subdirectory of the package's `skills/` directory is one skill, named after the subdirectory — that name is also the directory the skill materializes into — and the subdirectory's full contents are that skill. A package ships any number of skills — a dedicated skill package typically one, a library several. Files directly in `skills/` (e.g. a README) are ignored. The tool validates nothing about a skill: it does not check for a `SKILL.md`, a frontmatter `name`, or a well-formed skill name, and never warns about a skill's contents — whatever the package ships is what gets materialized. `skills/` is the only place the tool looks: a `SKILL.md` at the package root, a single `skill/` directory, or a `skills/` directory holding only files does not count, so a package shipping only that is not a skill package at all, and nothing is reported about it.

#### Rationale

Naming by directory is how both the agentskills.io spec (which requires the frontmatter `name` to equal the directory name) and antfu/skills-npm identify a skill. Validating would turn the tool into a linter for other people's packages: the user cannot fix a broken skill inside a dependency, so a warning about it is noise, and the agent tooling that reads the skill reports problems where they can be acted on. Several skills per package is what lets a library ship the skills for using it inside the library itself: a skill and the code it describes are then always the same version. A directory per skill is also future-proof: it works for today's materialization (copying the directory's contents out of `node_modules/`) and equally for a potential future mode that symlinks each skill entry straight to the package.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
