Defines the package link [1] — what symlink mode materializes: how a link is made, and how an existing symlink is recognized as one.

## Glossary

[1] package link: a symlink in a skills directory pointing straight at a skill's directory inside its package in `node_modules/`: `<skills directory>/<name>` → `<node_modules>/<package>/skills/<name>`.

## Business logic — TL;DR

- **Relative, through the package's stable path** - a package link [1] is relative to the skills directory it lives in, and its target goes through the package's top-level `node_modules/<package>/` entry — never through a package manager's internal, versioned paths.
- **Recognized by the shape of its target** - any symlink whose target has the shape `…/node_modules/<package>/skills/<skill>` is a package link [1], whether or not the target exists; the target names the package and the skill.

## Business logic

### Relative, through the package's stable path

#### User story

Developer: `npm update` updates a skill in place, and the repository — where the link is committed — shows no change; cloning the repository to another path keeps every link valid.

#### Business logic

A package link [1] is created relative to the skills directory it lives in (e.g. `.agents/skills/awesome-memory` → `../../node_modules/skill-awesome-memory/skills/awesome-memory`). Its target is the skill's directory as enumeration found it (`enumerate.SPEC.md`): through the package's top-level entry in the `node_modules/` directory the package was found in, never resolved through the symlinks a package manager may place there.

#### Rationale

pnpm installs every package under a versioned path in its virtual store (`node_modules/.pnpm/<package>@<version>/node_modules/<package>/`) and makes the top-level `node_modules/<package>` a symlink to it. The top-level entry is the stable path: an update changes what it points at, not where it is. A link to the versioned path would break on every update and put a version-specific path in the repository. A relative link survives cloning the repository to any location.

### Recognized by the shape of its target

#### Problem

The tool must know which symlinks are its own — to re-point them, and to remove them once their package is gone — without any metadata file: nothing is ever written into `node_modules/`.

#### Business logic

A symlink is a package link [1] if and only if its target — read one hop, without following further symlinks — has the shape `…/node_modules/<package>/skills/<skill>`, `<package>` being one path segment or, for a scoped package, two (`@scope/name`). The target need not exist: after its package is uninstalled the link dangles, and its target still tells which package and skill it was made for. A link whose target has that shape but goes through a versioned path (pnpm's virtual store) is a package link too — one pointing at the wrong place, which a sync re-points. Anything else — a symlink to a sibling skills directory, to a package's root, to something deeper inside a skill — is not a package link.

#### Rationale

The target's shape is unambiguous: nothing but a skill of an npm package lives at `node_modules/<package>/skills/<skill>`, so a link there was either made by the tool or made by hand to the same effect — and either way, tracking the package (following its updates, disappearing with it) is what such a link is for.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
