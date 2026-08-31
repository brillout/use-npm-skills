Extracts a skill's name from its `SKILL.md`, and validates it against the agentskills.io naming rules.

## Business logic — TL;DR

- **Name extraction** - the `name` field of the `SKILL.md` YAML frontmatter block, tolerant of real-world file variations.
- **Name validation** - the agentskills.io rules: lowercase letters, digits, hyphens; no leading/trailing hyphen; at most 64 characters.

## Business logic

### Name extraction

#### Problem

The skill's frontmatter `name` names the materialized directory (see `enumerate.SPEC.md`), so it must be read reliably from `SKILL.md` files as they exist in the wild.

#### Business logic

The name is the top-level `name` field of the YAML frontmatter block that opens the file (between `---` fences). Tolerated variations: a leading byte-order mark, CRLF line endings, a frontmatter block ending at the end of the file, and single- or double-quoted values (unquoted). Not accepted: a `name` outside the frontmatter, or one nested/indented under another field — only a top-level `name` counts. No frontmatter, or no top-level `name`, means the skill has no name (the caller skips the package with a warning).

### Name validation

#### Problem

The name becomes a directory name; an unvalidated one could collide with path syntax or escape the skills directory.

#### Business logic

A valid skill name has at most 64 characters and consists of lowercase letters, digits, and hyphens, starting and ending with a letter or digit — the agentskills.io spec. This also guarantees the name is safe as a directory name (no path separators, no `..`).

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
