Removes orphans [1]: tool-owned skills the caller disowns — for a sync, the skills whose package is no longer installed or no longer provides them; for `uninstall-package` (`hooks.SPEC.md`), the skills of that one package.

## Glossary

[1] orphan: a tool-owned skill entry (it carries a `source.json`) that the caller disowns: for a sync, one whose recorded package no longer materializes a skill of that name — the package was uninstalled, excluded in the config file, or no longer ships a skill of that name (it renamed or dropped the skill); for `uninstall-package`, one recorded as coming from the package being uninstalled.

[2] adopt: turn a locally modified orphan [1] into a user-authored skill by deleting only its `source.json`; the user's files stay.

## Business logic — TL;DR

- **Pristine orphans are deleted** - an unmodified orphan [1] disappears together with its mirror symlinks.
- **Modified orphans are adopted** - a locally modified orphan is adopted [2], keeping the user's changes.

## Business logic

### Pristine orphans are deleted

#### User story

The developer uninstalls a skill package and expects the next `npx use-npm-skills` run to remove its skill everywhere — the uninstall counterpart no package manager provides itself.

#### Business logic

In every physical skills directory, a tool-owned entry whose recorded package no longer materializes a skill of that name is an orphan [1] — for a package shipping several skills, only the skills it dropped are orphans; the ones it still ships stay. An orphan whose content hash still matches its `source.json` is pristine and is deleted, along with every symlink in the other skills directories that points into it. User-authored entries (no `source.json`) are never candidates.

### Modified orphans are adopted

#### User story

The tamper warning promises: "to keep your changes, remove the package" — so uninstalling (or excluding) the package must keep the edited skill.

#### Business logic

An orphan whose content hash no longer matches its `source.json` — or whose content cannot be read — is adopted [2]: only the `source.json` is deleted, and a warning says the skill is kept as user-authored. From then on it is an ordinary user-authored skill: the tool never touches it again, even if the package is reinstalled later.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
