# `use-npm-skills`

Install AI-agent skills with npm.

A [skill](https://agentskills.io) is a folder with a `SKILL.md` that teaches an AI agent — Claude Code, Cursor, and others — how to do a specific job well: review code the way your team does, write your changelog, drive your deploy tooling.

Skills are usually installed by copy-paste: a script clones files into your repo, and from then on they're on their own — updating means re-copying, and nothing tells you (or your teammates) which version you actually have. npm solved all of this for code a long time ago. `use-npm-skills` lets skills ride along:

- **Install** a skill like any dependency — it shows up where your agents look for skills.
- **Update** skills with `npm update`, like everything else.
- **Pin** exact skill content for the whole team, through your lockfile.
- **Publish** a skill like any npm package: versions, ownership, deprecation — all included.

Contents: [Using skills](#using-skills) · [Publishing a skill](#publishing-a-skill) · [How it works](#how-it-works) · [FAQ](#faq)

## Using skills

Grab a skill package from npm — any package with `use-npm-skills` in its keywords ([browse them all](https://www.npmjs.com/search?q=keywords%3Ause-npm-skills)) — and run the tool:

```shell
npm install --save-dev changelog-skill
npx use-npm-skills
```

```
+ changelog (changelog-skill@2.0.0) → .agents/skills
1 skill(s) in sync across .agents/skills
```

The skill is now a regular folder in your repo:

```
.agents/skills/
└── changelog/
    ├── SKILL.md
    └── source.json    ← marks the skill as managed by use-npm-skills
```

Commit it. That's the point: the skill lives in your repo as plain files, so every teammate — and every agent reading a fresh clone — has it immediately, no install step required. The package in `node_modules` is just where updates come from.

Works with npm, pnpm, Bun, and Yarn (with `node_modules`; Yarn PnP isn't supported). Requires Node 18+.

### Updating and removing skills

`use-npm-skills` never runs by itself — no postinstall hooks, on purpose ([why?](#faq)). Whenever you add, update, or remove skill packages, run it again:

```shell
npm update changelog-skill    && npx use-npm-skills   # update a skill
npm uninstall changelog-skill && npx use-npm-skills   # remove a skill (its folder is cleaned up too)
```

Running it extra times is always safe — when everything is in sync, it does nothing.

### Your own skills, your own edits

Skills you wrote yourself (any skill folder without a `source.json`) are never touched.

If you edit an *installed* skill, `use-npm-skills` notices and refuses to overwrite you:

```
Warning: skill `changelog` was modified locally — to keep your changes, remove
`changelog-skill` or add it to `"exclude"` in `.use-npm-skills.json`; or run
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
my-changelog-skill/
├── package.json
└── SKILL.md
```

```json
{
  "name": "my-changelog-skill",
  "version": "1.0.0",
  "keywords": ["use-npm-skills"]
}
```

```md
---
name: changelog
description: How to write changelog entries this project's way.
---

When asked to update the changelog, ...
```

That's it — `npm publish`, and anyone can install your skill. Two things matter:

- The **`use-npm-skills` keyword** is what marks your package as a skill package — and lists it in the [npm keyword search](https://www.npmjs.com/search?q=keywords%3Ause-npm-skills) where users go looking for skills.
- The **frontmatter `name`** becomes the skill's folder name in the user's repo. Lowercase letters, digits, and hyphens.

### Skills with more files

If your skill ships more than a `SKILL.md` — reference docs, scripts, templates — put everything in a `skill/` directory; its full contents are installed:

```
my-changelog-skill/
├── package.json          ← add "files": ["skill"] to keep the package lean
└── skill/
    ├── SKILL.md
    ├── reference.md
    └── examples/good-entry.md
```

One package ships one skill. Publishing several skills = publishing several packages.

### Try it before publishing

Install your package into a scratch project straight from disk:

```shell
npm install --save-dev ../my-changelog-skill
npx use-npm-skills
```

### Maintaining a skill

Exactly like maintaining a package — because it is one. Ship fixes as patch releases and breaking rewrites as majors; users get them with `npm update`, see them in `npm outdated`, and their lockfile records precisely which version of your skill the whole team runs. Retiring a skill is `npm deprecate`.

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
