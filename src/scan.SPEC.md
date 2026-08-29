Finds the skill packages installed in the project, and decides the entry name each skill gets
in the skills directories.

## User story

From the root `SPEC.md`:

- **Skills as dependencies** — installed skill packages must be found reliably, with nothing
  to configure, on every package manager's `node_modules/` layout.

## Business logic — TL;DR

- **Discovery** — a skill package is any top-level `node_modules/` package that depends on
  `use-npm-skills`; nothing else is consulted.
- **One package = one skill** — a root `SKILL.md`, or exactly one `skills/<dir>/SKILL.md`;
  anything else is skipped with a warning.
- **Entry naming** — `npm-<package name>` (scope marker dropped, separators become hyphens).

## Business logic

### Discovery

#### User story

Skills as dependencies (root `SPEC.md`).

#### Business logic

- The packages at the top level of the project root's `node_modules/` are scanned, scoped
  packages included (hidden entries are ignored). A package is a skill package iff it
  declares a dependency on `use-npm-skills` — regular, peer, or optional. Nothing else — no
  field, keyword, registry, or lockfile — is consulted.
- `use-npm-skills` itself is never treated as a skill package.
- Packages listed in the `exclude` configuration are skipped, and each skip is announced.

#### Rationale

- Skill packages are direct dependencies of the project, so top-level scanning finds them on
  hoisted layouts (npm, yarn) and on pnpm's isolated layout alike — no lockfile parsing
  needed.

### One package = one skill

#### User story

Skills as dependencies (root `SPEC.md`).

#### Business logic

The skill a package ships is either the package root itself (a root `SKILL.md`) or exactly
one `skills/<dir>/SKILL.md` inside the package. A skill package with no `SKILL.md`, or with
several skills, is skipped with a warning naming the reason. Collections are published as
multiple packages.

### Entry naming

#### User story

Skills as dependencies (root `SPEC.md`).

#### Business logic

- Each skill's entry name is `npm-` followed by the package name, made filesystem-safe: the
  scope marker `@` is dropped and separators become hyphens (`@matt/grilling` →
  `npm-matt-grilling`).
- Should two installed packages still map to the same entry name, the first (in alphabetical
  order of their `node_modules/` locations) keeps it and the other is skipped with a warning
  naming the collision.

#### Rationale

- The `npm-` prefix marks entries as managed by `use-npm-skills`; naming by package name
  makes collisions all but impossible (npm names are unique). Neither affects agents: the
  skill name agents see comes from the `SKILL.md` frontmatter, not from the entry name.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
