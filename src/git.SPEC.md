The repository-facing side of a sync: reading the uncommitted state the run must respect, and
the automated commit of what the run changed — designed so that it can never mix with,
corrupt, or impersonate the developer's own work.

## User story

From the root `SPEC.md`:

- **Skills in the repository** — skill changes land as clearly attributed, reviewable
  commits.
- **Trust and control** — the developer's own edits never end up inside an automated commit,
  and hand-edited skill content is recognized so it is never overwritten.

## Business logic — TL;DR

- **Reading the repository's state** — which paths carry uncommitted changes (distinguishing
  edits to tracked content from untracked additions), which paths git tracks at all, and
  which paths the developer's `.gitignore` covers; unavailable git degrades gracefully.
- **The commit** — exactly the paths the sync decided to commit, committed under a bot
  identity, titled `Add npm skills` or `Update npm skills`, naming the source packages;
  unsigned, hooks skipped, staged files never swept in.
- **When the commit is skipped** — repository states where a commit could go wrong; the
  changes then stay uncommitted and the reason is announced.

## Business logic

### Reading the repository's state

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

Before a sync modifies anything, it reads the repository's uncommitted state under the paths
it may touch. Three questions are answerable per path, and drive the protections described in
`src/materialize.SPEC.md` and `src/sync.SPEC.md`:

- Does the path carry uncommitted changes — and are they changes to git-tracked content (a
  hand-edit of committed files) as opposed to untracked additions?
- Does git track any content under the path at all (distinguishing "committed earlier" from
  "never committed")?
- Is the path covered by the developer's `.gitignore` rules?

When git is unavailable or the project is not a repository, these questions have no answers:
the sync then proceeds without the git-based protections, and the commit is skipped with its
reason (below).

### The commit

#### User story

Skills in the repository, Trust and control (root `SPEC.md`).

#### Business logic

- The commit contains exactly the paths handed over by the sync (see `src/sync.SPEC.md` for
  what those are) — restricted by path, so files the developer staged or modified are never
  swept in and remain exactly as they were.
- The commit's title is `Add npm skills` when the sync created new managed entries, `Update
  npm skills` otherwise; its body says it is automated, names the skill packages (and
  versions) the content comes from, how to undo the commit while keeping its changes
  (`git reset HEAD~1`), how to disable automated commits (the `gitCommit: false`
  configuration), and links the documentation.
- Author and committer are the bot identity `use-npm-skills <bot@npm:use-npm-skills>` — never
  the developer's identity. The commit is never signed, and the repository's git hooks are
  not run.

### When the commit is skipped

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

In any of the following situations the changes stay in place, uncommitted, and the skip and
its reason are announced:

- CI; git is not available; the project is not in a git repository.
- The repository is in a state a commit would disturb: detached HEAD, or a merge, rebase,
  cherry-pick, revert, or bisect in progress.
- The commit itself fails for any other reason.

(Keeping individual paths out of an otherwise-made commit — developer-modified files,
ignored paths — is the sync's decision, described in `src/sync.SPEC.md`.)

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
