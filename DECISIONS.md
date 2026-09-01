Non-obvious decisions only, grouped by business-logic flow. Anything not listed is left
to the implementer's judgment. Flag conflicts instead of silently deviating.

## Flow: sync (`npx use-npm-skills`, the default action)
Resolve project root → enumerate installed skill packages → determine target skills dirs
→ analyze existing structure → materialize each skill → prune orphaned skills.

### Resolve project root
- Walk up to the nearest lockfile (⇒ the workspace root in monorepos — by design:
  "skills apply repo-wide and should therefore be installed at the monorepo root").

### Enumerate installed skill packages
- A skill package = a top-level `node_modules` package whose `package.json` has
  **`"use-npm-skills"` in `keywords`** — the only marker; the keyword doubles as a
  free directory of all published skills via npmjs keyword search. A marked package
  without a `skill/` directory ⇒ skip. Root-level scan only (sufficient on pnpm's strict
  layout because skill packages are direct deps); no lockfile parsing. Yarn PnP:
  detect `.pnp.cjs`, print "unsupported", exit 0.

### Determine target skills dirs
- Targets = `<root>/skills/` and `<root>/<dir>/skills/` (one level deep, dot-dirs
  included — subsumes `.claude/skills`, `.agents/skills`, `.cursor/skills`, and any
  future agent's dir without maintaining a list; excludes `node_modules/`), counting
  only dirs containing ≥1 `*/SKILL.md` — an existing-but-empty dir is a Git leftover,
  not a target. Deeper nesting (`apps/web/.claude/skills/`) is unsupported by design.
  If none qualify: create and use `.agents/skills/` only.

### Analyze existing structure
- **Analysis always wins.** Precedence: dir-level symlink (e.g. `.claude/skills` →
  `.agents/skills`: one physical dir, nothing to mirror) → per-skill symlinks (follow
  the pattern) → duplicated skills without symlinks (duplicate likewise) → mixed:
  majority wins; tie ⇒ default.
- Default pattern: real files in `.agents/skills/` (if it's not a target: first target
  alphabetically), per-skill **relative** symlinks in the other dirs.
- Windows: symlinks where [Git symlink support is
  available](https://stackoverflow.com/questions/5917249/git-symbolic-links-in-windows/59761201#59761201)
  — effective `core.symlinks` resolves true (unset = disabled, Git for
  Windows' default) **and** a probe symlink at the root succeeds (Developer
  Mode/elevation); otherwise copies are the default. Checked only when the
  default applies (analysis still wins). Any doubt ⇒ copies: a wrong
  "available" breaks teammates' checkouts, a wrong "unavailable" just copies.

### Materialize each skill
- The skill npm package ships its skill in a `skill/` directory (materialization takes
  the dir's full contents) — the **only** supported layout. A root-`SKILL.md` layout
  was considered and dropped as not future-proof: a directory works both for today's
  copy materialization out of `node_modules/` and for a potential future mode that
  symlinks each skill entry straight to the package — a lone `SKILL.md` in a package
  root full of unrelated files could never be the target of such a symlink.
  One package = one skill.
- Materialized entries are real files meant to be **committed** (nothing is gitignored)
  — requirement: repos must be skill-aware at rest, i.e. an agent reading a fresh clone
  sees every skill before anything is installed. This is why gitignored materialization
  and links into `node_modules` were rejected.
- **Symlinks only ever between skills dirs — never into `node_modules`** ⇒ every skill
  has real files and `source.json` always exists.
- Materialized dir name = the skill's frontmatter `name` (the agentskills.io spec
  requires dir == name).
- Skill-name collision between two installed packages: first alphabetically by package
  name wins; later ones skipped + warned.
- Ownership: an entry is tool-owned iff it carries `source.json` (directly, or resolved
  through its symlink). Everything else is user-authored and always wins: skip + warn.
- `source.json` = `{ "package", "version", "hash" }`. Hash covers
  materialized files, `source.json` excluded, newline-normalized — otherwise
  `core.autocrlf` checkouts make every skill look locally modified on Windows.
- **Tamper protection**: hash mismatch ⇒ the user edited the copy — leave untouched,
  warn: "skill `<name>` was modified locally — to keep your changes, remove `<pkg>` or
  add it to `"exclude"` in `.use-npm-skills.json`; or run
  `npx use-npm-skills --force` to override your changes", and exit non-zero (after
  processing the remaining skills). `--force`: list the skills whose changes would be
  lost, confirm per skill on a TTY (without a TTY: applies to all — provisional), then
  log "consider removing `<pkg>` — or adding it to `exclude` — if you want to keep
  your changes".

### Prune orphaned skills
- An orphan = a tool-owned entry (has `source.json`) whose package is no longer
  installed. Pristine orphan (hash matches) ⇒ delete it and its mirror symlinks.
  Modified orphan (hash mismatch) ⇒ **adopt**: delete only the `source.json` — the dir
  becomes an ordinary user-authored skill, honoring the tamper message's promise that
  removing the package keeps your changes.

## Cross-flow
- **Fully explicit by design — the tool ships zero lifecycle scripts and never installs
  hooks.** Run `npx use-npm-skills` after adding/updating/removing skill packages (the
  `prisma generate` model). Rationale, so nobody re-adds a postinstall "for
  convenience": package-manager lifecycle events are structurally unreliable (measured:
  dependency postinstalls are blocked by default on pnpm/Bun and don't re-run on skill
  updates on npm; no PM fires anything on uninstall; targeted `npm update` /
  `npm install <pkg>` fire no root hooks either). Half-working automation is worse
  than none. Being script-free is also a trust feature: no `approve-builds` prompts,
  nothing for supply-chain scanners to flag.
- Config `.use-npm-skills.json` (project root): `skillsDirs` (overrides list of
  `skills/` dir discovery), `exclude` (skip installed skill packages by name).
- Out of scope (decided, not forgotten): Yarn PnP · nested skills dirs ·
  multi-skill packages.
