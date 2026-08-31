Decides how skills are laid out across multiple target skills directories: which directory holds a skill's real files (the primary directory [1]), and whether the other directories mirror [2] it with symlinks or with copies. The decision is derived from the structure the repository already has — the existing structure always wins over the default.

## Glossary

[1] primary directory: the one skills directory that holds a skill's real files when mirroring uses symlinks; the other directories link to it.

[2] mirror: make the same skill appear in every target skills directory — either as a per-skill relative symlink to the primary directory [1], or as an independent copy.

## Business logic — TL;DR

- **Directory-level symlinks collapse** - target directories that are symlinks to the same physical directory count as one; there is nothing to mirror between them.
- **The existing structure always wins** - existing per-skill symlinks or duplicated copies determine the mirror style and primary directory [1] by majority vote.
- **Default pattern** - real files in `.agents/skills/` (or the first target alphabetically), relative symlinks elsewhere; on Windows, copies instead of symlinks.

## Business logic

### Directory-level symlinks collapse

#### User story

A developer who already made `.claude/skills` a symlink to `.agents/skills` has one physical skills directory; agents see the skills through the link and nothing must be duplicated.

#### Business logic

Target directories are grouped by the physical directory they resolve to; each group counts as one physical skills directory (represented by its non-symlink member). Mirroring only happens between distinct physical directories.

### The existing structure always wins

#### User story

A developer who already mirrors skills their own way — per-skill symlinks with a particular directory holding the real files, or plain duplicated copies — expects the tool to follow that structure, not impose its own.

#### Business logic

Every skill present in two or more physical skills directories is a vote: per-skill symlinks pointing into another target vote for the symlink style (and the directory holding the real files gains a vote as primary directory [1]); the same skill existing as real directories in several targets votes for the copy style. The majority style wins; the primary directory with the most votes wins (ties prefer the default). Only a tie between styles falls back to the default pattern.

### Default pattern

#### Problem

With several target skills directories and no existing structure to follow, the tool must pick where real files live and how the other directories mirror them.

#### Business logic

Default: real files in `.agents/skills/` — or, if `.agents/skills/` is not a target, the first target alphabetically — and per-skill relative symlinks in every other target. On Windows the default mirror style is copies instead of symlinks (the existing structure still wins).

#### Rationale

Relative symlinks survive moving or cloning the repository to another path. Windows defaults to copies because Git's symlink support there is frequently unavailable; per-skill (rather than directory-level) mirroring keeps user-authored skills possible in every directory.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
