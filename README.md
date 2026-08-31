# `use-npm-skills`

Install AI-agent [skills](https://agentskills.io) with npm. Instead of copy-pasting `SKILL.md` files into your repo, skills become regular dependencies: versioned, pinned by your lockfile, updated with `npm update`, published and maintained like any package.

Contents: [Using skills](#using-skills) · [Publishing a skill](#publishing-a-skill) · [How it works](#how-it-works) · [FAQ](#faq)

## Using skills

Install a skill package — any npm package with `use-npm-skills` in its keywords ([browse them all](https://www.npmjs.com/search?q=keywords%3Ause-npm-skills)) — and run the tool:

```shell
npm install --save-dev skill-awesome-memory
npx use-npm-skills
```

```
+ memory (skill-awesome-memory@1.0.0) → .agents/skills
1 skill(s) in sync across .agents/skills
```

The skill is now a regular folder in your repo:

```
.agents/skills/
└── memory/
    ├── SKILL.md
    └── source.json    ← marks the skill as managed by use-npm-skills
```

Commit it.

> [!NOTE]
> The skill is plain files in your repo: teammates and agents get it from a fresh clone, with no install step. The package in `node_modules` is only where updates come from.

Works with npm, pnpm, Bun, and Yarn (with `node_modules`; Yarn PnP isn't supported). Requires Node 18+.

### Updating and removing skills

`use-npm-skills` never runs by itself — no postinstall hooks, on purpose ([why?](#faq)). Whenever you add, update, or remove skill packages, run it again:

```shell
npm update skill-awesome-memory    && npx use-npm-skills   # update a skill
npm uninstall skill-awesome-memory && npx use-npm-skills   # remove a skill (its folder is cleaned up too)
```

Running it extra times is always safe — when everything is in sync, it does nothing.

### Your own skills, your own edits

Skills you wrote yourself (any skill folder without a `source.json`) are never touched.

If you edit an *installed* skill, `use-npm-skills` notices and refuses to overwrite you:

```
Warning: skill `memory` was modified locally — to keep your changes, remove
`skill-awesome-memory` or add it to `"exclude"` in `.use-npm-skills.json`; or run
`npx use-npm-skills --force` to override your changes
```

Both keep-my-changes routes do what they promise: after you remove (or `exclude`) the package, the edited skill stays in your repo and becomes an ordinary skill of your own. And `--force` asks per skill before discarding anything.

### Where skills go

- **Your repo already has skills dirs?** They're detected and used — `skills/` at the root, or any `*/skills/` one level down that contains at least one skill: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, and whatever the next agent brings.
- **No skills dir yet?** `.agents/skills/` is created. If your agent only reads its own dir (say, `.claude/skills/`), list both in the [configuration](#configuration).
- **Several skills dirs?** Each skill is written once and mirrored into the others with relative symlinks (plain copies on Windows). If your repo already mirrors skills differently — one dir symlinked to another, or duplicated copies — your existing layout is followed.
- **Monorepo?** Skills are installed at the workspace root, next to the lockfile: skills apply repo-wide.

### Configuration

Optional — `.use-npm-skills.json` at the project root:

```json
{
  "skillsDirs": [".agents/skills", ".claude/skills"],
  "exclude": ["some-skill-package"]
}
```

- `skillsDirs`: use exactly these dirs instead of auto-detection.
- `exclude`: ignore an installed skill package (its skill is removed — or kept as yours if you edited it).

For the CLI reference: `npx use-npm-skills --help`.

## Publishing a skill

A skill package is a normal npm package. The smallest one is two files:

```
skill-awesome-memory/
├── package.json
└── SKILL.md
```

```json
{
  "name": "skill-awesome-memory",
  "version": "1.0.0",
  "keywords": ["use-npm-skills"]
}
```

```md
---
name: memory
description: Maintain a MEMORY.md of project learnings across sessions.
---

When you learn something about this project that isn't written down anywhere, ...
```

That's it — `npm publish`, and anyone can install your skill. Two things matter:

- The **`use-npm-skills` keyword** is what marks your package as a skill package — and lists it in the [npm keyword search](https://www.npmjs.com/search?q=keywords%3Ause-npm-skills) where users go looking for skills.
- The **frontmatter `name`** becomes the skill's folder name in the user's repo. Lowercase letters, digits, and hyphens.

### Skills with more files

If your skill ships more than a `SKILL.md` — reference docs, scripts, templates — put everything in a `skill/` directory; its full contents are installed:

```
skill-awesome-memory/
├── package.json          ← add "files": ["skill"] to keep the package lean
└── skill/
    ├── SKILL.md
    ├── reference.md
    └── templates/MEMORY.md
```

One package ships one skill. Publishing several skills = publishing several packages.

### Try it before publishing

Install your package into a scratch project straight from disk:

```shell
npm install --save-dev ../skill-awesome-memory
npx use-npm-skills
```

### Maintaining a skill

Like maintaining any package, because it is one: semver, `npm deprecate`, the works. Users pick up your releases with `npm update` + re-run, and their lockfile records exactly which version of your skill the whole team runs.

## How it works

The short version — enough to trust it with your repo:

- Installed skills are real, committed files. Nothing is gitignored, and nothing in your repo points into `node_modules` — a fresh clone is fully skill-aware before anyone runs anything.
- Every installed skill carries a `source.json`: which package and version it came from, plus a content hash. The hash is how local edits are detected (line-ending changes from Git's `autocrlf` don't count). No `source.json` = your skill, hands off.
- Symlinks are only ever created between skills dirs — relative, so they survive cloning to any path.
- The tool has zero install hooks and zero runtime dependencies. What you run is what happens.
- The exit code is non-zero when locally-modified skills were found — handy in CI to catch drift.

The full design rationale lives in [DECISIONS.md](./DECISIONS.md).

## FAQ

**Why doesn't it run automatically on `npm install`?**
Because package managers make that unreliable: pnpm and Bun block dependency postinstall scripts by default, npm doesn't re-fire them on updates, and nothing at all runs on uninstall. Automation that works half the time is worse than a command you can trust — so, like `prisma generate`, you run `npx use-npm-skills` explicitly. Bonus: a package with no scripts is one your supply-chain scanner and your security team don't need to worry about.

**Why commit the skills instead of gitignoring them?**
An agent reading a fresh clone should see every skill without anyone running an install first. Your repo stays fully self-describing.

**What if two installed packages provide a skill with the same name?**
The first package alphabetically wins; the other is skipped with a warning.

**Windows?**
Supported — skills are copied into each skills dir instead of symlinked, since Git's symlink support on Windows is unreliable.

**Yarn PnP?**
Not supported (there's no `node_modules` to read skills from). The tool detects it, says so, and exits cleanly.

## License

[MIT](./LICENSE)
