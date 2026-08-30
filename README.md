# `use-npm-skills`

npm as the distribution channel for AI-agent skills (the [agentskills.io](https://agentskills.io) `SKILL.md` convention).

Today skills are distributed by copy-paste: installers clone files from GitHub into your repo, updates are manual, and nothing ties the skill you have to a version anyone can name. npm already solves all of this for code — semver, lockfiles, updates, deprecations. Skills get the same treatment:

- **Authors** publish a skill as a normal npm package and maintain it like one.
- **Users** get skills like any dependency: install the package, run `npx use-npm-skills`, and the skill shows up where their agents look for skills (`.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, …). Upgrading a skill is `npm update` + re-run; the lockfile pins exactly which skill content the whole team has.

## Using skills

```bash
npm install -D some-skill-package   # any package with "use-npm-skills" in its keywords
npx use-npm-skills                  # materialize skills into your skills dir(s)
git add -A && git commit            # skills are committed, on purpose (see below)
```

Run `npx use-npm-skills` again after adding, updating, or removing skill packages — the tool deliberately installs no lifecycle hooks (the `prisma generate` model; see [FAQ](#faq)).

Discover published skills on npm: [`keywords:use-npm-skills`](https://www.npmjs.com/search?q=keywords%3Ause-npm-skills).

### Where skills end up

- If your repo already has skills dirs (`<root>/skills/` or `<root>/<dir>/skills/`, e.g. `.claude/skills/` — any dir containing at least one skill), those are the targets.
- Otherwise `.agents/skills/` is created and used.
- With several targets, real files go into one dir (`.agents/skills/` by default) and the others get per-skill relative symlinks — unless your repo already mirrors skills differently (dir-level symlink, per-skill symlinks elsewhere, or plain copies): the existing structure always wins. On Windows, copies are the default.
- In monorepos, skills are installed at the workspace root (the nearest lockfile) — skills apply repo-wide.

Materialized skills are real, committed files: a fresh clone is skill-aware before anything is installed. Each materialized skill carries a `source.json` (`package`, `version`, `source`, `hash`) marking it as tool-owned; skills without it are yours and are never touched.

### Local edits are protected

If you edit a materialized skill, `use-npm-skills` notices (content hash) and leaves it alone, telling you how to keep your changes — remove the package or [`exclude`](#configuration) it (the skill is then adopted as yours) — or overwrite them with `npx use-npm-skills --force` (asks per skill on a TTY).

When you uninstall a skill package, the next run removes its skill — unless you modified it, in which case only the `source.json` is removed and your version stays, now user-authored.

### Configuration

`.use-npm-skills.json` at the project root (optional):

```json
{
  "skillsDirs": [".agents/skills", ".claude/skills"],
  "exclude": ["some-skill-package"]
}
```

- `skillsDirs` — override skills-dir discovery.
- `exclude` — skip installed skill packages by name.

## Publishing a skill

A skill package is a normal npm package with:

1. `"use-npm-skills"` in `package.json` `keywords` — the only marker (it also makes your skill discoverable via npm keyword search), and
2. one of two layouts (one package = one skill):
   - a root `SKILL.md` — for a single-file skill, or
   - a `skill/` directory — its full contents are materialized (`skill/SKILL.md` plus any reference files, scripts, …).

```jsonc
// package.json
{
  "name": "my-skill-package",
  "version": "1.0.0",
  "keywords": ["use-npm-skills"],
  "files": ["skill"]
}
```

The `SKILL.md` frontmatter `name` (lowercase letters, digits, hyphens) names the materialized directory, per the agentskills.io spec. Version, deprecate, and publish like any package.

## FAQ

**Why no `postinstall` hook?**
Package-manager lifecycle events are structurally unreliable: dependency postinstalls are blocked by default on pnpm and Bun and don't re-run on skill updates on npm; no package manager fires anything on uninstall; targeted `npm update <pkg>` / `npm install <pkg>` fire no root hooks either. Half-working automation is worse than none — so the tool is fully explicit, like `prisma generate`. Being script-free is also a trust feature: no `approve-builds` prompts, nothing for supply-chain scanners to flag.

**Why commit the skills instead of gitignoring them?**
Repos must be skill-aware at rest: an agent reading a fresh clone sees every skill before anything is installed. This is also why skills are never symlinked into `node_modules`.

**Exit codes** — `0`: success; non-zero: locally-modified skills were found (and left untouched), or an error occurred.

**Out of scope** (decided): Yarn PnP (detected, reported, exits 0) · nested skills dirs (`apps/web/.claude/skills/`) · Windows symlinks (copies instead) · multi-skill packages.

See [GOAL.md](./GOAL.md) and [DECISIONS.md](./DECISIONS.md) for the full design.
