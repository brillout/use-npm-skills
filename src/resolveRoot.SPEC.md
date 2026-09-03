Determines the project root — the directory where skills are installed, where the config file lives, and where the search for installed packages starts.

## Business logic — TL;DR

- **Git repository root, then lockfile, then working directory** - the project root is the Git repository root; outside a Git repository, the nearest directory holding a package-manager lockfile; failing that, the working directory itself.

## Business logic

### Git repository root, then lockfile, then working directory

#### User story

A developer whose JavaScript workspace lives in a subdirectory of the repository — a `node/` directory holding the lockfile and `node_modules/`, say — or who works in a monorepo runs `npx use-npm-skills` from anywhere in the repository and expects the skills to land where their agents look for them: the repository root's skills directories. A developer working outside a Git repository expects the tool to work all the same.

#### Business logic

Starting from the current working directory and walking up towards the filesystem root, the project root is the first directory containing a `.git` entry — a directory, or a file as in Git worktrees and submodules. If no directory up to the filesystem root contains one, the working directory is not inside a Git repository, and the project root is instead the first directory, walking up the same way, containing a package-manager lockfile (npm's `package-lock.json` or `npm-shrinkwrap.json`, pnpm's `pnpm-lock.yaml`, Yarn's `yarn.lock`, Bun's `bun.lock` or `bun.lockb`). If there is none of those either, the working directory itself is the project root. Inside a Git repository, lockfiles play no role.

#### Rationale

Agents read their skills directories (`.claude/skills/`, `.agents/skills/`, …) at the repository root, whatever directory the JavaScript project's lockfile lives in — a workspace nested in a subdirectory is common ([antfu/skills-npm#38](https://github.com/antfu/skills-npm/issues/38)). Outside a Git repository the tool still has to work: the lockfile is the marker every supported package manager leaves at a project's root, and a directory with neither is its own root.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
