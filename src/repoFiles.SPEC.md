Keeps two of the project's own files in shape: `.gitignore` (managed entries must never be
committed) and `package.json` (the root postinstall hook that keeps future installs syncing).

## User story

From the root `SPEC.md`:

- **Skills as dependencies** — machine-local entries must not leak into version control.
- **Hands-off syncing** — future installs must sync even on package managers that don't run
  dependency install scripts.
- **Trust and control** — edits to the developer's files are minimal and style-preserving.

## Business logic — TL;DR

- **`.gitignore` upkeep** — ensures ignore patterns covering the managed entries of every
  target skills directory; only missing lines are added.
- **The root postinstall hook** — `"postinstall": "npx use-npm-skills"` is added to the
  project's `package.json`, by explicit runs only, and only when the stamp proves the package
  manager doesn't run dependency install scripts.
- **Style-preserving rewrites** — `package.json` edits preserve formatting and key order.

## Business logic

### `.gitignore` upkeep

#### User story

Skills as dependencies (root `SPEC.md`).

#### Business logic

- The project's `.gitignore` is made to ignore the managed entries of every target skills
  directory: a single `**/skills/npm-*` pattern covers all directories named `skills`; a
  target directory not named `skills` gets its own `<dir>/npm-*` line.
- Only lines that are missing are appended; the file is created if absent; its line-ending
  style is preserved.

#### Rationale

- Managed entries are machine-local paths into `node_modules/`, recreated on any machine by a
  sync — committing them would break other machines' checkouts.

### The root postinstall hook

#### User story

Hands-off syncing (root `SPEC.md`).

#### Business logic

- The hook — `"postinstall": "npx use-npm-skills"` in the project's `package.json` — makes
  every future install of the project sync. It is added by explicit runs only (lifecycle runs
  never modify `package.json`), and only when needed: when the stamp is absent or older than
  the project's lockfile, which proves the last install did not run dependency install
  scripts (pnpm and Bun block them by default), so without the hook, skills would drift.
- An existing postinstall script that already runs `use-npm-skills` is left byte-for-byte
  alone. Any other existing postinstall script gets ` && npx use-npm-skills` appended, with a
  warning asking the developer to double-check the merged script.
- The setup announces itself, including how to opt out (the `postinstall: false`
  configuration).
- An unreadable or malformed `package.json`, or a postinstall entry that is not text, skips
  the setup with a warning.

### Style-preserving rewrites

#### User story

Trust and control (root `SPEC.md`).

#### Business logic

`package.json` is rewritten preserving its indentation, line-ending style, presence of a
trailing newline, and key order — the edit diff is exactly the added script, nothing else.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
