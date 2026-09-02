Finds the skills of the installed skill packages [1]: which of the project's installed npm packages are skill packages, and which skills — by name and location — each of them ships.

## Glossary

[1] skill package: an installed npm package marked with `"use-npm-skills"` in its `package.json` `keywords`, shipping one or more skills, each as a `skills/<name>/` directory.

## Business logic — TL;DR

- **The keyword is the only marker** - a skill package [1] is any top-level `node_modules` package with `"use-npm-skills"` in its keywords; nothing else qualifies a package.
- **Skills live in skills/** - every subdirectory of the package's `skills/` directory is one skill; a package ships any number of them, and `skills/` is the only place the tool looks.
- **A skill is named by its directory** - the skill's name is its directory name under `skills/`, valid per the agentskills.io spec; the `SKILL.md` frontmatter `name` must match it.
- **Broken skills are skipped, not fatal** - a marked package shipping no skills, and each unusable skill, is warned about and skipped; the run continues.

## Business logic

### The keyword is the only marker

#### User story

The skill author marks their package with one keyword and it works; developers discover all published skills by searching npm for that keyword.

#### Business logic

Every top-level package in the project root's `node_modules/` — scoped packages (`@scope/name`) included — whose `package.json` has `"use-npm-skills"` in its `keywords` array is a skill package [1]. There is no other marker and no lockfile parsing. Packages are processed in alphabetical order of their package name, and each package's skills in alphabetical order of their name, which makes every later "first one wins" rule deterministic. A missing `node_modules/` is a usage error telling the user to install dependencies first.

#### Rationale

A top-level-only scan is sufficient even on pnpm's strict layout because skill packages are direct dependencies of the project. The keyword doubles as a free public directory of all published skills via npm keyword search.

### Skills live in skills/

#### User story

The skill author puts each skill the package ships — its `SKILL.md`, plus any reference docs, scripts, templates — into its own subdirectory of the package's `skills/` directory. A library author ships the skills for using the library the same way, next to the library's code, so skills and code are versioned together.

#### Business logic

A skill package ships its skills in a `skills/` directory at the package root: every subdirectory of `skills/` is one skill, and the subdirectory's full contents are that skill. A package ships any number of skills — a dedicated skill package typically one, a library several. Files directly in `skills/` (e.g. a README) are ignored. This is the only place the tool looks — a `SKILL.md` at the package root, or a single `skill/` directory, does not count, so a package shipping only that is treated as shipping no skills (see "Broken skills are skipped, not fatal").

#### Rationale

Several skills per package is what lets a library ship the skills for using it inside the library itself: a skill and the code it describes are then always the same version. The layout — `skills/` with one subdirectory per skill — is the one [antfu/skills-npm](https://github.com/antfu/skills-npm) established, so one package serves both tools. A directory per skill is also future-proof: it works for today's materialization (copying the directory's contents out of `node_modules/`) and equally for a potential future mode that symlinks each skill entry straight to the package — a directory can be the target of such a symlink, while a lone `SKILL.md` in a package root full of unrelated files cannot.

### A skill is named by its directory

#### Problem

The directory a skill materializes into must match the skill's own name — the agentskills.io spec requires the `name` in `SKILL.md` to equal the directory name — and the npm package name is a different namespace (e.g. `@acme/skill-pkg` cannot be a directory name).

#### Business logic

A skill's name is its directory name under `skills/`. It must be a valid agentskills.io skill name: lowercase letters, digits, and hyphens, not starting or ending with a hyphen, at most 64 characters. The `name` field of the skill's `SKILL.md` YAML frontmatter (parsing rules: `frontmatter.SPEC.md`) must be present and equal to the directory name — a skill whose frontmatter says otherwise is unusable (see "Broken skills are skipped, not fatal"). Because names are directory names, two skills of the same package can never share a name.

#### Rationale

Naming by directory is how both the agentskills.io spec and antfu/skills-npm identify a skill; checking the frontmatter against it catches a mismatched skill in the package instead of materializing a skill that violates the spec into the user's repository.

### Broken skills are skipped, not fatal

#### Problem

One broken skill package — or one broken skill in a package that ships several — must not prevent every other skill from syncing.

#### Business logic

A package carrying the keyword but shipping no skills (no `skills/` directory, or one without subdirectories) is skipped with a warning naming the package and the expected layout. Within `skills/`, a subdirectory with an invalid name, without a `SKILL.md`, with an unreadable one, with no frontmatter `name`, or with a frontmatter `name` different from the directory name is skipped with a warning naming the package, the subdirectory, and the reason; the package's other skills, and the remaining packages, are processed normally.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
