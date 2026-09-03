Determines the project root — the directory where skills are installed — and the Git repository root, where the search for installed packages starts.

## Business logic — TL;DR

- **Nearest lockfile wins** - the project root is the nearest ancestor directory containing a package-manager lockfile; in monorepos, the workspace root.
- **The Git repository root starts the crawl** - the nearest ancestor of the project root containing a `.git` entry; without one, the project root itself.

## Business logic

### Nearest lockfile wins

#### User story

A developer in a monorepo runs `npx use-npm-skills` from any workspace package and expects skills to land at the repository's workspace root, because skills apply repo-wide.

#### Business logic

Starting from the current working directory, walk up towards the filesystem root; the first directory containing a package-manager lockfile (npm's `package-lock.json` or `npm-shrinkwrap.json`, pnpm's `pnpm-lock.yaml`, Yarn's `yarn.lock`, Bun's `bun.lock` or `bun.lockb`) is the project root. In monorepos that is the workspace root. If no directory up to the filesystem root contains a lockfile, there is no project (the caller reports a usage error).

#### Rationale

Skills apply repo-wide and should therefore be installed at the monorepo root; the lockfile is the marker that is always present exactly there after an install, for every supported package manager.

### The Git repository root starts the crawl

#### User story

A developer whose Git repository holds several JavaScript projects — say a `frontend/` with its own lockfile next to a `tools/` project — expects the skills shipped by any of their dependencies to be found, whichever project they run the tool from.

#### Business logic

Starting from the project root, walk up towards the filesystem root; the first directory containing a `.git` entry — a directory, or a file as in Git worktrees and submodules — is the Git repository root, and the search for installed packages (`enumerate.SPEC.md`) starts there. When no ancestor contains a `.git` entry, the search starts at the project root.

#### Rationale

The search covers the entire Git repository, not just the lockfile's project: a repository can hold several projects, and skills from any of them count. Skills are still installed at the project root, where the lockfile is.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
