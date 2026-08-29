The automated commit of what a sync changed — designed so that it can never mix with, corrupt,
or impersonate the developer's own work.

## User story

From the root `SPEC.md`:

- **Trust and control** — the sync's edits to `.gitignore` and `package.json` are committed
  out of the developer's way, clearly attributed, and easy to undo — or not committed at all
  whenever committing could interfere with what the developer is doing.

## Business logic — TL;DR

- **The commit** — exactly the files the sync changed, committed under a bot identity, with
  undo and opt-out instructions in the message; unsigned, hooks skipped, staged files never
  swept in.
- **When the commit is skipped** — any situation where an automated commit could go wrong or
  mix with the developer's work; the changes then stay uncommitted and the reason is
  announced.

## Business logic

### The commit

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

- After a sync modifies `.gitignore` and/or `package.json`, those files — exactly those — are
  committed. The commit is restricted to the changed files by path, so files the developer
  staged or modified are never swept in and remain exactly as they were.
- The commit's title is `Add npm skills`; its body says it is automated, how to undo it while
  keeping its changes (`git reset HEAD~1`), how to disable automated commits (the
  `gitCommit: false` configuration), and links the documentation.
- Author and committer are the bot identity `use-npm-skills <bot@npm:use-npm-skills>` — never
  the developer's identity. The commit is never signed, and the repository's git hooks are
  not run.

### When the commit is skipped

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

In any of the following situations the changes stay in place, uncommitted, and the skip and
its reason are announced:

- CI; git is not available; the project is not in a git repository; the repository's status
  cannot be determined.
- The file to commit already had uncommitted changes before the run — measured before the run
  modifies anything, so the developer's own edits never end up inside an automated commit.
- The repository is in a state a commit would disturb: detached HEAD, or a merge, rebase,
  cherry-pick, revert, or bisect in progress.
- The commit itself fails for any other reason.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
