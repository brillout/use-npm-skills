Removes orphans [1]: tool-owned skills the caller disowns — for a sync, the skills whose package is no longer installed or no longer provides them; for `uninstall-package` (`hooks.SPEC.md`), the skills of that one package.

## Glossary

[1] orphan: a tool-owned skill entry — a package link (a symlink into a package's `skills/` directory, dangling or not; `packageLink.SPEC.md`) or a copy carrying a `source.json` — that the caller disowns, given the package and skill it records: for a sync, one whose package no longer materializes a skill of that name — the package was uninstalled, excluded in the config file, or no longer ships a skill of that name (it renamed or dropped the skill); for `uninstall-package`, one recorded as coming from the package being uninstalled.

[2] adopt: turn a locally modified copy that is an orphan [1] into a user-authored skill by deleting only its `source.json`; the user's files stay.

## Business logic — TL;DR

- **Links and pristine copies are deleted** - an orphan [1] that is a package link, or a copy still matching its `source.json`, disappears — a copy together with its mirror symlinks.
- **Modified copies are adopted** - a locally modified orphan copy is adopted [2], keeping the user's changes.

## Business logic

### Links and pristine copies are deleted

#### User story

The developer uninstalls a skill package and expects the next `npx use-npm-skills` run to remove its skill everywhere — the uninstall counterpart no package manager provides itself.

#### Business logic

In every physical skills directory, each tool-owned entry the caller disowns is an orphan [1] — for a package shipping several skills, only the skills it dropped are orphans; the ones it still ships stay. A package link identifies its package and skill by its target, so a link left dangling by an uninstalled package is recognized and deleted like any other. A copy whose content hash still matches its `source.json` is pristine and is deleted, along with every symlink in the other skills directories that points into it. A skill removed from several directories is reported once, naming the directories. User-authored entries are never candidates. A hand-made link into a package's `skills/` directory under a name of the user's choosing is treated as a package link too: it stays as long as the package provides the skill it points at, and goes when the package does.

### Modified copies are adopted

#### User story

The tamper warning promises: "to keep your changes, remove the package" — so uninstalling (or excluding) the package must keep the edited skill.

#### Business logic

An orphan copy whose content hash no longer matches its `source.json` — or whose content cannot be read — is adopted [2]: only the `source.json` is deleted, and a warning says the skill is kept as user-authored. From then on it is an ordinary user-authored skill: the tool never touches it again, even if the package is reinstalled later.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
