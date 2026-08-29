What these tests cover — scaffolding a skill package:

- In an empty directory: a `package.json` is created (name derived from the directory name,
  a publish allowlist containing only `SKILL.md`, the `use-npm-skills` dependency at the
  scaffolding tool's own version) along with a `SKILL.md` template whose frontmatter name
  matches; publishing guidance is printed.
- Directory names are sanitized into valid package names.
- An existing `package.json` is extended, not clobbered: fields, values, and formatting are
  preserved while the dependency is added; the `SKILL.md` frontmatter name is derived from
  the package name, with scoped names flattened.
- An existing `SKILL.md` is left byte-for-byte alone.
- An existing `skills/<dir>/SKILL.md` layout is detected — no root `SKILL.md` is created
  next to it.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
