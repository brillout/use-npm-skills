Determines the project root — the directory where skills are installed.

## Business logic — TL;DR

- **Nearest lockfile wins** - the project root is the nearest ancestor directory containing a package-manager lockfile; in monorepos, the workspace root.

## Business logic

### Nearest lockfile wins

#### User story

A developer in a monorepo runs `npx use-npm-skills` from any workspace package and expects skills to land at the repository's workspace root, because skills apply repo-wide.

#### Business logic

Starting from the current working directory, walk up towards the filesystem root; the first directory containing a package-manager lockfile (npm's `package-lock.json` or `npm-shrinkwrap.json`, pnpm's `pnpm-lock.yaml`, Yarn's `yarn.lock`, Bun's `bun.lock` or `bun.lockb`) is the project root. In monorepos that is the workspace root. If no directory up to the filesystem root contains a lockfile, there is no project (the caller reports a usage error).

#### Rationale

Skills apply repo-wide and should therefore be installed at the monorepo root; the lockfile is the marker that is always present exactly there after an install, for every supported package manager.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
