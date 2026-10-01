Writes every skill of the installed skill packages into the target skills directories — the only step that creates or overwrites skills. It decides, per skill and per directory, whether to create a package link [1], write real files, refresh metadata, create a mirror symlink, or keep its hands off, and it reports one outcome per skill.

## Glossary

[1] package link: a symlink from a skills directory straight to the skill's directory inside its package (`packageLink.SPEC.md`) — what symlink mode materializes.

[2] copy: a skill materialized as real files in a skills directory, carrying a `source.json` [3] — what copy mode materializes.

[3] source.json: the metadata file written into every copy [2]: the source package's name and version, and the content hash of the copied files.

[4] tool-owned: a skill entry the tool created and may therefore update or remove: a package link [1] (dangling or not), a copy [2] — recognized by its `source.json` [3] — or a mirror symlink resolving to a copy.

[5] user-authored: a skill entry that is not tool-owned [4] — a hand-written directory, a plain file, a symlink to content of the user's own; the tool never touches it.

[6] locally modified: a copy [2] whose current content hash no longer matches the hash recorded in its `source.json` [3] — the user edited the copy.

[7] adopt: turn a locally modified [6] copy that its recorded package no longer provides into a user-authored [5] skill by deleting only its `source.json` [3]; the user's files stay.

[8] primary directory: in copy mode, the one skills directory that holds a skill's real files under the symlink mirror style [9]; the other directories link to it (decided in `analyze.SPEC.md`).

[9] mirror style: in copy mode, how a skill appears in the skills directories beyond its real files — per-skill relative symlinks to the primary directory [8], or independent copies in every directory (decided in `analyze.SPEC.md`).

## Business logic — TL;DR

- **Ownership** - a package link [1] or a `source.json` [3] marks an entry as tool-owned [4]; user-authored [5] entries always win and are skipped with a warning.
- **Skill-name collision** - two installed packages providing the same skill name: the first package alphabetically wins, the other is skipped with a warning.
- **Symlink mode: a package link in every directory** - each physical skills directory gets a package link [1]; a link pointing elsewhere, a mirror symlink, or a pristine copy in its place is replaced; nothing is hashed.
- **Copy mode: tamper protection** - a locally modified [6] copy is left completely untouched (warning + non-zero exit), unless the user consents via `--force`.
- **Copy mode: adoption before overwrite** - a locally modified copy that its recorded package no longer provides is adopted [7] instead of overwritten.
- **Copy mode: minimal writes and mirroring** - unchanged content is left alone; a version-only bump refreshes just the metadata; changed content is replaced wholesale; real files go to the primary directory [8] (copy style: to every directory) and the other directories get relative symlinks.
- **Symlinks fall back to copies** - where a symlink cannot be created, a copy [2] is written instead, with a warning.
- **One package at a time, on request** - the `install-package` command writes a single package's skills, with name collisions still decided over all installed skills.
- **Sync status** - a skill is in sync when every directory holds exactly what a sync would leave there; user-authored content in the way counts as in sync.

## Business logic

### Ownership

#### User story

The developer hand-writes skills in the same skills directories the tool materializes into, and must be able to trust that the tool never modifies or deletes what it didn't create.

#### Business logic

An entry is tool-owned [4] if and only if it is a package link [1] — recognized by the shape of its target, whether or not the target exists — or it carries a `source.json` [3], directly or, for a symlink entry, in the directory the symlink resolves to. Everything else — a hand-written skill directory, a plain file occupying the skill's place, a symlink to user content — is user-authored [5] and always wins: the skill is not written there, and a warning explains that removing the user's entry would let the package's version in. A `source.json` that cannot be parsed still marks the entry as tool-owned, and its unusable contents make the entry count as locally modified [6] with no installed owner — so the entry ends up adopted [7], never deleted. In copy mode, a skill package shipping its own `source.json` inside a skill's directory (`skills/<name>/source.json`) has that file left out of the copy (with a warning): the name is reserved for the tool's metadata.

#### Rationale

A package link's target names its package, and a per-copy marker file survives every workflow (copying skills around, deleting `node_modules/`, fresh clones) — neither needs a central registry, and both err on the side of never deleting user content.

### Skill-name collision

#### Problem

Two installed skill packages can ship a skill of the same name, but one directory name can hold only one skill. (Within a single package, skill names are directory names and therefore unique.)

#### Business logic

The first package in alphabetical package-name order claims the skill name; every later package with the same skill name is skipped with a warning naming both packages.

### Symlink mode: a package link in every directory

#### User story

Developer: after `npm install skill-awesome-memory` and a run, every skills directory of my project has `awesome-memory`, pointing at the installed package; `npm update` updates it without another run.

#### Business logic

In symlink mode, every physical skills directory gets a package link [1] for the skill — a relative symlink to the skill's directory inside its package, through the package's stable path (`packageLink.SPEC.md`). A missing entry is created (the skill is reported as added). A package link that already points at exactly that path is up-to-date. Any other tool-owned [4] entry in its place is replaced by the link (the skill is reported as updated): a package link pointing elsewhere — at another package, or at a package manager's versioned path — a dangling symlink, a mirror symlink or a pristine copy [2] left from copy mode. A locally modified [6] copy is subject to tamper protection (below): it is replaced only with `--force`. No skill content is read or hashed: the installed package is the skill.

### Copy mode: tamper protection

#### User story

The developer edited a copy of a skill (tweaked a prompt, added a file) and must not lose that work to the next sync run.

#### Business logic

A copy [2] counts as locally modified [6] when its current content hash (hashing rules: `hash.SPEC.md`) differs from the hash recorded in `source.json` [3] — added files count; content that cannot be read counts as modified too. Without `--force`, a skill with a locally modified copy in any skills directory is left completely untouched — its other entries included, in either mode — and a warning explains the choices: keep the changes by removing the package or excluding it in the config file, or overwrite them with `npx use-npm-skills --force`; the run then exits non-zero. With `--force`, overwrite consent is requested per skill (see `cli.SPEC.md`); a declined skill is kept (exit 0), a consented one is replaced by the package's version — a fresh copy, or in symlink mode a package link [1] — followed by a reminder that removing or excluding the package is the way to keep local changes in the future.

### Copy mode: adoption before overwrite

#### User story

The tamper warning promises: "to keep your changes, remove the package". Uninstalling the package — or excluding it, or updating to a version that dropped the skill — must therefore preserve the edited skill.

#### Business logic

Before anything is written, a locally modified [6] copy whose `source.json` [3] records a package that no longer provides a skill of that name — it was uninstalled, excluded, or no longer ships the skill — is adopted [7]: only its `source.json` is deleted, a warning says the skill is kept as user-authored, and from then on the entry wins like any user-authored [5] skill — including against a package that provides the same skill name now or later.

### Copy mode: minimal writes and mirroring

#### Problem

Re-materializing identical content on every run would churn files, timestamps, and Git status for no reason; and several agents each read their own skills directory, but the skill must exist once and behave identically everywhere (mirroring decisions: `analyze.SPEC.md`).

#### Business logic

Under the symlink mirror style [9], real files are written only to the primary directory [8]; every other physical directory gets a per-skill relative symlink to the primary entry (existing correct links are kept; dangling or wrong ones are replaced; a real tool-owned copy or a package link standing where a mirror belongs is replaced by a mirror). Under the copy style, real files are written to every physical directory. Per directory holding real files: a missing entry is written fresh (the skill's files plus `source.json` [3]); a copy whose recorded hash, package, and version all match the package's current skill is up-to-date and untouched; same content but a different recorded version (a version-only bump): only `source.json` is rewritten; anything else in its place — a copy with different content, a package link, a mirror symlink, a dangling symlink — is deleted and the copy written wholesale, so files the new version no longer ships disappear. When user-authored [5] content blocks the primary directory under the symlink mirror style, no mirrors are created for that skill. A skill's outcome is reported as added when it appeared somewhere, as updated when something changed, as up-to-date otherwise.

### Symlinks fall back to copies

#### Problem

Symlink creation can fail where the layout decision assumed it works (a filesystem without symlinks, missing permissions).

#### Business logic

Where a symlink — a package link [1] or a mirror — cannot be created, a copy [2] of the skill is written in its place instead, with a warning.

### One package at a time, on request

#### User story

The `install-package` command (`hooks.SPEC.md`) runs from one package's lifecycle script and must install that package's skills without touching any other package's.

#### Business logic

When asked to write a single package's skills, every other installed package's skills are still walked to decide name collisions exactly as a full run would — a skill name claimed by an alphabetically earlier package is still that package's — but nothing is written, reported, or warned about for them.

### Sync status

#### Problem

The `install-package` command reports other packages' skills that a full sync would change, without changing them; it needs the same judgement the writing step makes, read-only.

#### Business logic

A skill is in sync when every physical skills directory holds exactly what a sync would leave there: in symlink mode, a package link [1] to the skill's stable path; in copy mode, a pristine copy [2] recording the skill's package, version, and current content hash in every directory that holds real files, and, under the symlink mirror style [9], a symlink resolving to the primary entry in every other directory. Otherwise it is missing (no entry, or a dangling symlink), modified locally (a locally modified [6] copy anywhere), or outdated (anything else: a link to another place, a copy of another package, version, or content, a copy where a link belongs or a link where a copy belongs). User-authored [5] content standing in its way counts as in sync — a full sync leaves it alone, and creates no mirrors when it blocks the primary directory.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
