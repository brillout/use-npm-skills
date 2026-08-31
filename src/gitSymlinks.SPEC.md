Answers one question for the mirroring decision (`analyze.SPEC.md`): is Git symlink support [1] available at the project root? Only consulted on Windows, where symlinks frequently don't work; on every other platform symlinks are assumed to work.

## Glossary

[1] Git symlink support: the machine can create real symlinks in the project and Git preserves them as symlinks rather than checking them out as plain text files. See https://stackoverflow.com/questions/5917249/git-symbolic-links-in-windows/59761201#59761201.

## Business logic — TL;DR

- **Two conditions, both required** - Git's `core.symlinks` setting resolves to enabled, and creating a symlink at the project root actually works.
- **Doubt means unavailable** - Git missing, the setting unset or disabled, or symlink creation refused each count as unavailable.

## Business logic

### Two conditions, both required

#### Problem

On Windows, symlinks fail in two independent ways: Git may be configured to check out committed symlinks as plain text files (breaking the skills directories of everyone who clones the repository), and the operating system refuses symlink creation unless Developer Mode is on or the process is elevated.

#### Business logic

Git symlink support [1] is available if and only if both hold at the project root:

1. Git's effective `core.symlinks` setting resolves to enabled — set at any configuration level (the Git for Windows installer option, a global setting, or the repository's own setting) and not overridden to disabled by a more specific level.
2. A symlink can actually be created there, verified by creating and immediately removing a probe symlink — this is what Windows only permits with Developer Mode or an elevated process, and what some filesystems refuse entirely.

#### Rationale

The first condition without the second means the tool could not create the links in the first place; the second without the first means the links would degrade to plain text files on the next checkout. This mirrors the two requirements of the reference answer [1].

### Doubt means unavailable

#### Business logic

Any failure — Git not installed, `core.symlinks` unset (Git for Windows disables symlink support by default) or disabled, symlink creation refused — counts as unavailable, making copies the mirroring default.

#### Rationale

A wrong "available" produces broken skills directories for the whole team; a wrong "unavailable" merely produces copies, which always work.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
