Determines the project root — the directory where skills are installed, where the config file lives, and where the search for installed packages starts: the Git repository root.

## Business logic — TL;DR

- **The Git repository root is the project root** - the nearest ancestor of the working directory containing a `.git` entry; not being inside a Git repository is a usage error.

## Business logic

### The Git repository root is the project root

#### User story

A developer whose JavaScript workspace lives in a subdirectory of the repository — a `node/` directory holding the lockfile and `node_modules/`, say — or who works in a monorepo runs `npx use-npm-skills` from anywhere in the repository and expects the skills to land where their agents look for them: the repository root's skills directories.

#### Business logic

Starting from the current working directory, walk up towards the filesystem root; the first directory containing a `.git` entry — a directory, or a file as in Git worktrees and submodules — is the project root. If no directory up to the filesystem root contains one, the working directory is not inside a Git repository and the caller reports a usage error. Where the package manager's lockfile or `node_modules/` live plays no role.

#### Rationale

Agents read their skills directories (`.claude/skills/`, `.agents/skills/`, …) at the repository root, whatever directory the JavaScript project's lockfile lives in — a workspace nested in a subdirectory is common ([antfu/skills-npm#38](https://github.com/antfu/skills-npm/issues/38)); and materialized skills are meant to be committed, which presupposes a repository.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
