Keeps two of the project's own files in shape: `.gitignore` (cleaning up the legacy v0.1
rule) and `package.json` (the root postinstall hook that keeps future installs syncing).

## User story

From the root `SPEC.md`:

- **Skills in the repository** — nothing may keep the committed skills out of version
  control.
- **Hands-off syncing** — future installs must sync even on package managers that don't run
  dependency install scripts.
- **Trust and control** — edits to the developer's files are minimal and style-preserving.

## Business logic — TL;DR

- **Legacy `.gitignore` cleanup** — the ignore rule v0.1 maintained would silently keep
  committed skills out of git; it is removed on sight.
- **The root postinstall hook** — `"postinstall": "npx use-npm-skills"` is added to the
  project's `package.json`, by explicit runs only, and only when the stamp proves the package
  manager doesn't run dependency install scripts.
- **Style-preserving rewrites** — `package.json` edits preserve formatting and key order.

## Business logic

### Legacy `.gitignore` cleanup

#### User story

Skills in the repository (root `SPEC.md`).

#### Business logic

`use-npm-skills` v0.1 kept managed entries out of version control and maintained `.gitignore`
rules to that effect. Committed skills invert this: a leftover rule would silently keep them
out of git. Syncs therefore remove the rules v0.1 wrote — exactly those lines, everything
else preserved (line-ending style included), announced. A `.gitignore` that consisted only of
the legacy rule is deleted outright.

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
