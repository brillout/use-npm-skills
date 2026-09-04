Non-obvious decisions only, grouped by business-logic flow, anything not listed is left
to the implementer's judgment, flag conflicts instead of silently deviating, keep
outdated decisions (no history).

## Flow: sync (`npx use-npm-skills`, the default action)
Resolve project root → enumerate installed skill packages → determine target skills dirs
→ decide the layout → materialize each skill → prune orphaned skills.

### Resolve project root
- Root = the Git repo root (nearest `.git` — dir or file — walking up from cwd): agents
  read their skills dirs at the repo root, and a JS workspace can live in a subdirectory
  ([skills-npm#38](https://github.com/antfu/skills-npm/issues/38)). Not in a Git repo ⇒
  the nearest lockfile's dir; none either ⇒ cwd. Skills dirs, config, and the package
  crawl all hang off it.

### Enumerate installed skill packages
- A skill package = a top-level `node_modules` package with a `skills/` directory holding
  ≥1 subdirectory — the **only** marker.
- Every `node_modules/` under the root is crawled — the root's own first, then by path; never one
  nested inside another (a dependency's own tree), never `.git/`, symlinks not followed —
  because pnpm installs a workspace package's deps in that package's own `node_modules/`
  ([skills-npm#34](https://github.com/antfu/skills-npm/issues/34)). Same package in
  several ⇒ the first copy that ships skills wins.
- A skill's location is the package's **top-level** path in that `node_modules/`
  (`node_modules/<pkg>/skills/<name>`), never `realpath`'d: pnpm's top-level entry is a
  symlink into its versioned store (`node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>`),
  and only the top-level path is stable across updates — it's what package links point at.
- Every subdirectory of `skills/` is a skill, taken as-is — no validation (no `SKILL.md`,
  frontmatter, or name checks) and no warnings: the tool mirrors packages, it doesn't lint
  them.
- Yarn PnP: detect `.pnp.cjs`, print "unsupported", exit 0.

### Determine target skills dirs
- Targets = `<root>/skills/` and `<root>/<dir>/skills/` (one level deep, dot-dirs
  included — subsumes `.claude/skills`, `.agents/skills`, `.cursor/skills`, and any
  future agent's dir without maintaining a list; excludes `node_modules/`), counting
  only dirs containing ≥1 skill entry: a `*/SKILL.md` (through symlinks) or a package
  link — dangling included, or a skills dir whose packages were all uninstalled would
  drop out of the targets and never get pruned. An existing-but-empty dir is a Git
  leftover, not a target. Deeper nesting (`apps/web/.claude/skills/`) is unsupported by
  design. If none qualify: create and use `.agents/skills/` only.

### Decide the layout
- Two modes, `"mode"` in `.use-npm-skills.json`: **`symlink`** (default) and **`copy`**.
  Copy mode and the setting are deliberately **undocumented for users** (README, `--help`)
  for now: an escape hatch for projects that want the skill files inside the repo, or
  can't use symlinks — to be documented once there is demand. The SPECs describe both,
  as they must.
- The mode is the setting, never inferred from the existing structure (inferring would
  freeze every project in the mode it was first synced in); a project synced in one mode
  migrates to the other on the next run (see materialize).
- **Symlink mode**: every physical skills dir gets a package link per skill — no primary
  dir, no mirroring; the dir-level symlink collapse still applies. Rationale: the repo
  holds no copy of skill content (nothing to drift, nothing to hash), `npm update` updates
  a skill in place without a run, and the link shows where a skill comes from. Price: a
  fresh clone's links dangle until dependencies are installed — accepted, agents work in
  installed checkouts.
- **Copy mode**: each skill is copied into the skills dirs as real files, every copy
  carrying a `source.json` (`{ "package", "version", "hash" }`) that marks it tool-owned
  and, via the hash, detects local edits (tamper protection, see materialize). With
  several skills dirs, one dir — the primary — holds the real files and the others
  mirror it: per-skill relative symlinks to the primary (the symlink style), or an
  independent copy in every dir (the copy style). For the mirror pattern, **analysis of
  the existing structure always wins** over the default. Precedence: dir-level symlink
  (e.g. `.claude/skills` → `.agents/skills`: one physical dir, nothing to mirror) →
  per-skill symlinks (follow the pattern) → duplicated skills without symlinks (duplicate
  likewise) → mixed: majority wins; tie ⇒ default. Package links cast no vote.
- Copy mode default pattern: real files in `.agents/skills/` (if it's not a target: first
  target alphabetically), per-skill **relative** symlinks in the other dirs.
- Windows: symlinks where [Git symlink support is
  available](https://stackoverflow.com/questions/5917249/git-symbolic-links-in-windows/59761201#59761201)
  — effective `core.symlinks` resolves true (unset = disabled, Git for
  Windows' default) **and** a probe symlink at the root succeeds (Developer
  Mode/elevation). Without it: symlink mode falls back to copy mode (one info line says
  so), and copy mode's default mirror style is copies (analysis still wins there). Any
  doubt ⇒ copies: a wrong "available" breaks teammates' checkouts, a wrong "unavailable"
  just copies. Mixed teams (a Windows machine without support alongside others) churn
  between links and copies — the committed `"mode": "copy"` setting is the fix, not
  more inference.

### Materialize each skill
- The skill npm package ships its skills in a `skills/` directory, one subdirectory
  per skill (`skills/<name>/`; materialization takes the subdirectory as a whole)
  — the **only** supported layout. One package = **any number** of skills.
- Materialized entries are meant to be **committed** (nothing is gitignored): a fresh
  clone has every skill once `npm install` has run (symlink mode) or before (copy mode).
- **Package link** (symlink mode) = `<skills dir>/<name>` → **relative** →
  `<node_modules>/<pkg>/skills/<name>`, through the top-level path (see enumerate). A
  link found pointing at a versioned pnpm path resolves to the same files but breaks on
  update ⇒ "outdated", re-pointed. Comparison is one hop (the link's own target), not
  `realpath`, for exactly that reason.
- Ownership: an entry is tool-owned iff it is a package link — recognized by the
  **shape of its one-hop target**, `…/node_modules/<pkg>/skills/<skill>` (scoped: two
  segments), dangling or not — or it carries `source.json` (directly, or resolved
  through its symlink: a copy-mode mirror). No metadata for links: nothing is ever
  written into `node_modules/`, and the target already names package + skill.
  Everything else is user-authored and always wins: skip + warn.
  Rationale for the shape rule: nothing but a package's skill lives at that path, so a
  link there — the tool's or hand-made — wants to track the package either way.
- Mode migration: a pristine copy (or a mirror link) where a package link belongs is
  replaced, and a package link where a copy belongs is replaced; a modified copy is
  tamper-protected as usual (`--force` replaces it with the link).
- Symlink creation failure (a filesystem without symlinks) ⇒ warn, fall back to a copy
  — for package links and mirror links alike.
- Copy mode: materialized dir name = the skill's directory name under `skills/`;
  `source.json` = `{ "package", "version", "hash" }`. Hash covers
  materialized files, `source.json` excluded, newline-normalized — otherwise
  `core.autocrlf` checkouts make every skill look locally modified on Windows.
- **Tamper protection** (copies only — a link has no local content; editing through it
  edits `node_modules/`, which is the user's problem like for any dependency): hash
  mismatch ⇒ the user edited the copy — leave the whole skill untouched (its other
  entries included, in either mode), warn: "skill `<name>` was modified locally — to
  keep your changes, remove `<pkg>` or add it to `"exclude"` in `.use-npm-skills.json`;
  or run `npx use-npm-skills --force` to override your changes", and exit non-zero
  (after processing the remaining skills). `--force`: list the skills whose changes would
  be lost, confirm per skill on a TTY (without a TTY: applies to all — provisional), then
  log "consider removing `<pkg>` — or adding it to `exclude` — if you want to keep
  your changes".
- Customizing a symlinked skill = replace the link with a real copy of the folder ⇒
  user-authored from then on (skip + warn while the package is installed; uninstalling
  or `exclude` silences it). No eject command — not needed yet.

### Prune orphaned skills
- An orphan = a tool-owned entry — a package link (dangling or not) or a copy with
  `source.json` — whose recorded package no longer provides a skill of that name —
  uninstalled, excluded, or it dropped/renamed the skill (a multi-skill package's other
  skills stay). For a package link, "recorded" = parsed from its target: the *target's*
  skill name, not the entry name, so a hand-made alias link into a package survives as
  long as the package provides the skill it points at.
- Package link orphan ⇒ delete the link. Pristine copy orphan (hash matches) ⇒ delete it
  and its mirror symlinks. A skill removed from several dirs is one `removed` outcome
  naming the dirs (like `added`).
  Modified copy orphan (hash mismatch) ⇒ **adopt**: delete only the `source.json` — the
  dir becomes an ordinary user-authored skill, honoring the tamper message's promise that
  removing the package keeps your changes.

## Flow: package hooks (`install-package` / `uninstall-package`, run by a skill package's own `postinstall` / `uninstall` scripts)
- Optional for skill packages (without them: tell users to run `npx use-npm-skills`); the tool
  itself still ships zero lifecycle scripts.
- Skill packages declare `use-npm-skills` as a **peer** dependency, not a dependency: the
  project's own copy (the recommended devDependency) runs the hooks when present, otherwise
  npm/pnpm/Bun install the missing peer (measured; Yarn doesn't ⇒ a Yarn project needs the
  devDependency). One tool version per project, chosen by the user — a dependency would nest a
  copy per skill package, each of its own version, all writing the same dirs.
- Package = the script's cwd (`package.json` name); project = the dir above the outermost
  `node_modules/` (pnpm runs scripts in `node_modules/.pnpm/…`), then the normal root resolution.
  Its skills = what the crawl finds for it from the root, not cwd's `skills/`: PMs link every
  dependency before running any postinstall (measured on npm and pnpm), and cwd would install
  skills the next sync prunes (pnpm transitive deps, the package's own repo — whose
  `npm install` runs its postinstall too ⇒ nothing installed there). This is also what keeps
  the package link on the stable top-level path when the script runs inside pnpm's store.
- `install-package` installs that **one** package's skills — never touches other packages'
  entries or symlinks — then reports (never fixes) what a full sync would change for them:
  missing, outdated (a link pointing elsewhere; copy mode: another package/version/content),
  left over (a dangling link counts), modified locally (copy mode). An updated package is
  nothing to report in symlink mode — its link is in sync whatever version is installed.
  Rationale: catch bad states as early as possible.
- Never fail a local install: a failing postinstall aborts the install and skips the other
  packages' postinstalls — the ones that would install the missing skills ⇒ deadlock. Errors
  are printed, exit 0. `CI` env var set (≠ `false`) ⇒ exit 1: CI runs on a fresh checkout (the
  check is exact there: committed links + `npm install`) and should be red on a stale skills
  dir. Locally the report is best-effort: PMs mostly hide a dependency's script output unless
  it fails (npm: `--foreground-scripts`).
- `uninstall-package` removes that one package's skills (links and pristine copies ⇒ delete,
  copies with their mirror links; modified copies ⇒ adopt). Not every PM runs uninstall
  scripts (npm ≥7, pnpm) — accepted; the next sync or install-package report catches
  leftovers.

## Cross-flow
- **Fully explicit by design — the tool ships zero lifecycle scripts and never installs
  hooks** (skill packages may opt into their own, see the package-hooks flow). Run
  `npx use-npm-skills` after adding/removing skill packages (the `prisma generate`
  model); updating needs no run in symlink mode. Rationale, so nobody re-adds a postinstall
  "for convenience": package-manager lifecycle events are structurally unreliable (measured:
  dependency postinstalls are blocked by default on pnpm/Bun and don't re-run on skill
  updates on npm; no PM fires anything on uninstall; targeted `npm update` /
  `npm install <pkg>` fire no root hooks either). Half-working automation is worse
  than none. Being script-free is also a trust feature: no `approve-builds` prompts,
  nothing for supply-chain scanners to flag.
- Config `.use-npm-skills.json` (project root): `mode` (`symlink` | `copy`, default
  `symlink`; undocumented for now), `skillsDirs` (overrides list of `skills/` dir
  discovery), `exclude` (skip installed skill packages by name).
