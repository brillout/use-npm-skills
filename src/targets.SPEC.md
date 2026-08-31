Determines the target skills directories [1] — where skills get materialized in this project.

## Glossary

[1] skills directory: a directory where AI agents look for skills; each skill in it is a subdirectory containing a `SKILL.md`.

## Business logic — TL;DR

- **Config override wins** - a `skillsDirs` list in the config file replaces discovery entirely.
- **Discovery by shape, not by name** - candidates are `<root>/skills/` and `<root>/<dir>/skills/` (one level deep); a candidate qualifies only if it already contains at least one skill.
- **Default when nothing qualifies** - `.agents/skills/` is used (and created when the first skill is written).

## Business logic

### Config override wins

#### User story

The developer whose skills directories don't match the discovery rules (or who wants to pin them explicitly) lists them in the config file.

#### Business logic

When the config file (`config.SPEC.md`) sets `skillsDirs`, exactly those directories are the targets — discovery is skipped, and directories that don't exist yet are still targets (created when written to).

### Discovery by shape, not by name

#### User story

Whatever AI agent the developer uses — Claude (`.claude/skills/`), Cursor (`.cursor/skills/`), the generic `.agents/skills/`, or a future agent's directory — its skills directory is found without the tool maintaining a list of known agents.

#### Business logic

Candidates are `<root>/skills/` and every `<root>/<dir>/skills/` one level below the project root, dot-directories included, `node_modules/` and `.git/` excluded. Deeper nesting (e.g. `apps/web/.claude/skills/`) is unsupported by design. A candidate qualifies as a target only if it already contains at least one skill (a subdirectory with a `SKILL.md`; a subdirectory symlink whose target contains a `SKILL.md` also counts): an existing-but-empty directory is a Git leftover, not a target.

#### Rationale

Matching the `*/skills/` shape subsumes every agent's convention without a hardcoded list. Requiring at least one skill prevents an abandoned empty directory from pulling materialization into a place no agent uses.

### Default when nothing qualifies

#### Problem

A project adopting skills for the first time has no skills directory yet; the tool must pick one rather than fail.

#### Business logic

When no candidate qualifies, the single target is `.agents/skills/`, created when the first skill is materialized into it.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
