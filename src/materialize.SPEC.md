Writes each skill package's skill into the target skills directories — the only step that creates or overwrites skills. It decides, per skill and per directory, whether to write real files, refresh metadata, create a mirror symlink, or keep its hands off, and it reports one outcome per skill.

## Glossary

[1] tool-owned: a skill entry that carries a `source.json` [2] (directly, or resolved through its symlink) — it was materialized by the tool, which may therefore update or remove it.

[2] source.json: the metadata file written into every materialized skill: the source package's name and version, and the content hash of the materialized files.

[3] user-authored: a skill entry without a `source.json` [2] — written by the user; the tool never touches it.

[4] locally modified: a tool-owned [1] skill whose current content hash no longer matches the hash recorded in its `source.json` [2] — the user edited the materialized copy.

[5] adopt: turn a locally modified [4] skill whose source package is gone into a user-authored [3] skill by deleting only its `source.json` [2]; the user's files stay.

[6] primary directory: the one skills directory that holds a skill's real files under the symlink mirror style [7]; the other directories link to it (decided in `analyze.SPEC.md`).

[7] mirror style: how a skill appears in the target skills directories beyond its real files — per-skill relative symlinks to the primary directory [6], or independent copies in every directory (decided in `analyze.SPEC.md`).

## Business logic — TL;DR

- **Ownership via source.json** - `source.json` [2] is the sole ownership marker; user-authored [3] entries always win and are skipped with a warning.
- **Skill-name collision** - two installed packages providing the same skill name: the first package alphabetically wins, the other is skipped with a warning.
- **Tamper protection** - a locally modified [4] skill is left completely untouched (warning + non-zero exit), unless the user consents via `--force`.
- **Adoption before overwrite** - a locally modified skill whose recorded package is no longer installed is adopted [5] instead of overwritten.
- **Minimal writes** - unchanged content is left alone; a version-only bump refreshes just the metadata; changed content is replaced wholesale (stale files removed).
- **Mirroring** - real files go to the primary directory [6] (copy style: to every directory); the other directories get relative symlinks, falling back to a copy where a symlink cannot be created.

## Business logic

### Ownership via source.json

#### User story

The developer hand-writes skills in the same skills directories the tool materializes into, and must be able to trust that the tool never modifies or deletes what it didn't create.

#### Business logic

An entry is tool-owned [1] if and only if it carries a `source.json` [2] — directly, or, for a symlink entry, in the directory the symlink resolves to. Everything else — a hand-written skill directory, a plain file occupying the skill's place, a symlink to user content — is user-authored [3] and always wins: the skill is not written there, and a warning explains that removing the user's entry would let the package's version in. A `source.json` that cannot be parsed still marks the entry as tool-owned, and its unusable contents make the entry count as locally modified [4] with no installed owner — so the entry ends up adopted [5], never deleted. A skill package shipping its own `source.json` inside its `skill/` directory has that file ignored (with a warning): the name is reserved for the tool's metadata.

#### Rationale

A per-entry marker file survives every workflow (copying skills around, deleting `node_modules/`, fresh clones) without a central registry, and errs on the side of never deleting user content.

### Skill-name collision

#### Problem

Two installed skill packages can declare the same skill name, but one directory name can hold only one skill.

#### Business logic

The first package in alphabetical package-name order claims the skill name; every later package with the same skill name is skipped with a warning naming both packages.

### Tamper protection

#### User story

The developer edited a materialized skill (tweaked a prompt, added a file) and must not lose that work to the next sync run.

#### Business logic

A tool-owned [1] skill counts as locally modified [4] when its current content hash (hashing rules: `hash.SPEC.md`) differs from the hash recorded in `source.json` [2] — added files count; content that cannot be read counts as modified too. Without `--force`, a locally modified skill is left completely untouched (its mirrors included) and a warning explains the choices: keep the changes by removing the package or excluding it in the config file, or overwrite them with `npx use-npm-skills --force`; the run then exits non-zero. With `--force`, overwrite consent is requested per skill (see `cli.SPEC.md`); a declined skill is kept (exit 0), a consented one is replaced by the package's version, followed by a reminder that removing or excluding the package is the way to keep local changes in the future.

### Adoption before overwrite

#### User story

The tamper warning promises: "to keep your changes, remove the package". Uninstalling the package (or excluding it) must therefore preserve the edited skill.

#### Business logic

Before anything is written, a locally modified [4] entry whose `source.json` [2] records a package that is no longer installed is adopted [5]: only its `source.json` is deleted, a warning says the skill is kept as user-authored, and from then on the entry wins like any user-authored [3] skill — including against a package that provides the same skill name now or later.

### Minimal writes

#### Problem

Re-materializing identical content on every run would churn files, timestamps, and Git status for no reason.

#### Business logic

Per target directory: a missing entry is written fresh (the skill's files plus `source.json` [2]). An entry whose recorded hash, package, and version all match the package's current skill is up-to-date and untouched. Same content but a different recorded version (a version-only bump): only `source.json` is rewritten. Different content: the entry is deleted and rewritten wholesale, so files the new version no longer ships disappear. Written files keep the package's executable bit, so a skill's scripts stay runnable from the materialized copy; permissions never count as content (`hash.SPEC.md`). A skill's outcome is reported as added when it appeared somewhere, as updated when something changed, as up-to-date otherwise.

### Mirroring

#### Problem

Several agents each read their own skills directory, but the skill must exist once and behave identically everywhere (mirroring decisions: `analyze.SPEC.md`).

#### Business logic

Under the symlink mirror style [7], real files are written only to the primary directory [6]; every other target directory gets a per-skill relative symlink to the primary entry (existing correct links are kept; dangling or wrong ones are replaced; a real tool-owned copy standing where a link belongs is replaced by a link). Under the copy style, real files are written to every physical directory. Where a symlink cannot be created (e.g. missing permissions on Windows), a copy is written instead, with a warning. When user-authored [3] content blocks the primary directory under the symlink style, no mirrors are created for that skill.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
