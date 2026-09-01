Finds the installed skill packages: which of the project's installed npm packages ship a skill, and under what skill name.

## Glossary

[1] skill package: an installed npm package marked with `"use-npm-skills"` in its `package.json` `keywords`, shipping exactly one skill.

## Business logic — TL;DR

- **The keyword is the only marker** - a skill package [1] is any top-level `node_modules` package with `"use-npm-skills"` in its keywords; nothing else qualifies a package.
- **The skill lives in skill/** - the package's `skill/` directory holds the whole skill; it is the only place the tool looks — a `SKILL.md` at the package root does not count.
- **The skill is named by its frontmatter** - the `name` field of the skill's `SKILL.md` frontmatter names the skill; it must be valid per the agentskills.io spec.
- **Broken packages are skipped, not fatal** - a marked package without a usable skill is warned about and skipped; the run continues.

## Business logic

### The keyword is the only marker

#### User story

The skill author marks their package with one keyword and it works; developers discover all published skills by searching npm for that keyword.

#### Business logic

Every top-level package in the project root's `node_modules/` — scoped packages (`@scope/name`) included — whose `package.json` has `"use-npm-skills"` in its `keywords` array is a skill package [1]. There is no other marker and no lockfile parsing. Packages are processed in alphabetical order of their package name, which makes every later "first one wins" rule deterministic. A missing `node_modules/` is a usage error telling the user to install dependencies first.

#### Rationale

A top-level-only scan is sufficient even on pnpm's strict layout because skill packages are direct dependencies of the project. The keyword doubles as a free public directory of all published skills via npm keyword search.

### The skill lives in skill/

#### User story

The skill author puts everything the skill ships — its `SKILL.md`, plus any reference docs, scripts, templates — into the package's `skill/` directory.

#### Business logic

A skill package ships its skill as a `skill/` directory at the package root, containing a `SKILL.md`; the directory's full contents are the skill. This is the only place the tool looks — in particular, a `SKILL.md` at the package root does not count, so a package shipping only that is treated as shipping no skill (see "Broken packages are skipped, not fatal"). One package delivers exactly one skill; multi-skill packages are out of scope by design.

#### Rationale

A single directory-shaped layout is future-proof: it works for today's materialization (copying the directory's contents out of `node_modules/`) and equally for a potential future mode that symlinks each skill entry straight to the package — a directory can be the target of such a symlink, while a lone `SKILL.md` in a package root full of unrelated files (`package.json`, `README.md`, …) cannot.

### The skill is named by its frontmatter

#### Problem

The directory a skill materializes into must match the skill's own name — the agentskills.io spec requires the directory name to equal the skill name — and the npm package name is a different namespace (e.g. `@acme/skill-pkg` cannot be a directory name).

#### Business logic

The skill's name is the `name` field of its `SKILL.md` YAML frontmatter (parsing rules: `frontmatter.SPEC.md`). It must be a valid agentskills.io skill name: lowercase letters, digits, and hyphens, not starting or ending with a hyphen, at most 64 characters.

### Broken packages are skipped, not fatal

#### Problem

One broken skill package must not prevent every other skill from syncing.

#### Business logic

A package carrying the keyword but shipping no `skill/` directory, an unreadable `skill/SKILL.md`, a missing frontmatter `name`, or an invalid skill name is skipped with a warning naming the package and the reason; the run continues with the remaining packages.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
