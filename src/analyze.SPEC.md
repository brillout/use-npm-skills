Decides the layout skills are materialized in: which physical skills directories there are, the mode — symlink mode [1] or copy mode [2] — and, in copy mode, which directory holds a skill's real files (the primary directory [3]) and whether the other directories mirror [4] it with symlinks or with copies. In copy mode the decision is derived from the structure the repository already has — the existing structure always wins over the default.

## Glossary

[1] symlink mode: the default mode — every physical skills directory gets, per skill, a package link: a symlink to the skill's directory inside its package (see `packageLink.SPEC.md`).

[2] copy mode: skills are copied into the skills directories as real files (the `mode` setting of the config file, or the fallback where symlinks are unavailable).

[3] primary directory: in copy mode [2], the one skills directory that holds a skill's real files when mirroring uses symlinks; the other directories link to it.

[4] mirror: in copy mode [2], make the same skill appear in every physical skills directory — either as a per-skill relative symlink to the primary directory [3], or as an independent copy.

## Business logic — TL;DR

- **Directory-level symlinks collapse** - target directories that are symlinks to the same physical directory count as one; there is nothing to mirror between them.
- **The mode: the setting, unless symlinks are unavailable** - symlink mode [1] unless the config says copy; on Windows without Git symlink support, symlink mode falls back to copy mode [2].
- **Copy mode: the existing structure always wins** - existing per-skill symlinks or duplicated copies determine the mirror style and primary directory [3] by majority vote.
- **Copy mode: default pattern** - real files in `.agents/skills/` (or the first target alphabetically), relative symlinks elsewhere; on Windows, copies instead of symlinks unless Git symlink support is available.

## Business logic

### Directory-level symlinks collapse

#### User story

A developer who already made `.claude/skills` a symlink to `.agents/skills` has one physical skills directory; agents see the skills through the link and nothing must be duplicated.

#### Business logic

Target directories are grouped by the physical directory they resolve to; each group counts as one physical skills directory (represented by its non-symlink member). Skills are materialized — and, in copy mode, mirrored — only in distinct physical directories.

### The mode: the setting, unless symlinks are unavailable

#### User story

The developer gets symlinked skills by default; a developer who set `"mode": "copy"` gets copies; a developer on a Windows machine where symlinks don't work gets copies rather than a failure.

#### Business logic

The mode is the config file's `mode` setting (`config.SPEC.md`), symlink mode [1] when unset. Symlinks are assumed to work on every platform but Windows, where they need Git symlink support (`gitSymlinks.SPEC.md`); without it, symlink mode falls back to copy mode [2] for the run, and the run says so. In symlink mode nothing else is decided: every physical skills directory gets a package link per skill, with no primary directory and no mirroring. The existing structure plays no role in the mode: a project synced in one mode migrates to the other on the next run (see `materialize.SPEC.md`).

#### Rationale

The mode is a project setting, not something to infer from the skills directories: inferring it would freeze every existing project in whatever mode it was first synced in. Windows falls back to copies rather than failing so the tool always works; a wrong "symlinks available" would break the checkouts of everyone who clones the repository, a wrong "unavailable" merely produces copies.

### Copy mode: the existing structure always wins

#### User story

A developer who already mirrors skills their own way — per-skill symlinks with a particular directory holding the real files, or plain duplicated copies — expects the tool to follow that structure, not impose its own.

#### Business logic

Every skill present in two or more physical skills directories is a vote: per-skill symlinks pointing into another target vote for the symlink style (and the directory holding the real files gains a vote as primary directory [3]); the same skill existing as real directories in several targets votes for the copy style. Package links (symlink mode's entries) cast no vote. The majority style wins; the primary directory with the most votes wins (ties prefer the default). Only a tie between styles falls back to the default pattern.

### Copy mode: default pattern

#### Problem

With several target skills directories and no existing structure to follow, the tool must pick where real files live and how the other directories mirror them.

#### Business logic

Default: real files in `.agents/skills/` — or, if `.agents/skills/` is not a target, the first target alphabetically — and per-skill relative symlinks in every other target. On Windows the default mirror style is copies instead of symlinks — unless Git symlink support is available (`gitSymlinks.SPEC.md`), in which case symlinks are the default like on every other platform.

#### Rationale

Relative symlinks survive moving or cloning the repository to another path. Windows defaults to copies because Git's symlink support there is disabled by default and frequently unavailable — but a machine set up for it gets the same symlink pattern as every other platform. Per-skill (rather than directory-level) mirroring keeps user-authored skills possible in every directory.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
