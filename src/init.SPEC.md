Turns the current directory into a publishable skill package (`npx use-npm-skills init`).

## User story

From the root `SPEC.md`:

- **Publishing skills** — a skill author gets from an empty directory (or an existing
  package) to something publishable with one command and one file to fill in.

## Business logic — TL;DR

- **Scaffolding** — ensures the two things that make a skill package: a `package.json`
  depending on `use-npm-skills`, and a `SKILL.md`; existing files are preserved and only
  minimally extended.
- **Guidance** — each action is announced, followed by the next steps to publication.

## Business logic

### Scaffolding

#### User story

Publishing skills (root `SPEC.md`).

#### Business logic

- Without a `package.json`, one is created: the name derived from the directory name
  (sanitized into a valid npm package name), a starting version, a publish allowlist
  containing only `SKILL.md`, and the `use-npm-skills` dependency — the dependency is what
  marks the package as a skill package.
- An existing `package.json` is preserved and only minimally extended: the `use-npm-skills`
  dependency is added if missing; `SKILL.md` is added to an existing publish allowlist when
  the skill file is about to be created; formatting and key order are preserved. A malformed
  `package.json` fails the run with a clear message.
- If the directory has no skill file yet — neither a root `SKILL.md` nor a
  `skills/<dir>/SKILL.md` — a `SKILL.md` template is created: frontmatter whose name is
  derived from the package name per the skill-naming convention (lowercase letters, digits,
  hyphens, 64 characters at most; scoped names are flattened), and placeholders marking what
  the author must fill in. An existing skill file is left alone.

### Guidance

#### User story

Publishing skills (root `SPEC.md`).

#### Business logic

Each action taken is announced — or, when the directory is already fully set up, that there
was nothing to do. Every run ends with the next steps: fill in `SKILL.md`, publish with
`npm publish`, and how users then install the skill.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
