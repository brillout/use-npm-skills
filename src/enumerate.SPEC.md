Finds the installed skill packages: which of the project's installed npm packages ship a skill, and under what skill name.

## Glossary

[1] skill package: an installed npm package marked with `"use-npm-skills"` in its `package.json` `keywords`, shipping exactly one skill.

[2] skill layout: the place inside a skill package where the skill lives — either a single `SKILL.md` file at the package root, or a `skill/` directory whose full contents are the skill.

## Business logic — TL;DR

- **The keyword is the only marker** - a skill package [1] is any top-level `node_modules` package with `"use-npm-skills"` in its keywords; nothing else qualifies a package.
- **Two skill layouts** - a root `SKILL.md`, or a `skill/` directory; a package shipping both gets `skill/` (with a warning).
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

### Two skill layouts

#### User story

The skill author publishes either a single-file skill (just a `SKILL.md`) or a full skill directory (`SKILL.md` plus reference files, scripts, …).

#### Business logic

A skill package ships its skill in one of two layouts [2]: a `SKILL.md` at the package root (the skill is that one file), or a `skill/` directory (the skill is the directory's full contents). One package delivers exactly one skill; multi-skill packages are out of scope by design. A package shipping both layouts gets `skill/` and a warning.

### The skill is named by its frontmatter

#### Problem

The directory a skill materializes into must match the skill's own name — the agentskills.io spec requires the directory name to equal the skill name — and the npm package name is a different namespace (e.g. `@acme/skill-pkg` cannot be a directory name).

#### Business logic

The skill's name is the `name` field of its `SKILL.md` YAML frontmatter (parsing rules: `frontmatter.SPEC.md`). It must be a valid agentskills.io skill name: lowercase letters, digits, and hyphens, not starting or ending with a hyphen, at most 64 characters.

### Broken packages are skipped, not fatal

#### Problem

One broken skill package must not prevent every other skill from syncing.

#### Business logic

A package carrying the keyword but shipping no skill layout, an unreadable `SKILL.md`, a missing frontmatter `name`, or an invalid skill name is skipped with a warning naming the package and the reason; the run continues with the remaining packages.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
