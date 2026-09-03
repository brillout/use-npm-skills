# `use-npm-skills`

Install AI-agent [skills](https://agentskills.io) with npm. Instead of copy-pasting `SKILL.md` files into your repo, skills become regular dependencies: versioned, pinned by your lockfile, updated with `npm update`, published and maintained like any package.

Contents: [Using skills](#using-skills) · [Publishing skills](#publishing-skills) · [How it works](#how-it-works) · [FAQ](#faq)

## Using skills

Install `use-npm-skills` and a skill package — any npm package that ships skills in a `skills/` directory, the same convention as [skills-npm](https://github.com/antfu/skills-npm) — and run the tool:

```shell
npm install --save-dev use-npm-skills skill-awesome-memory
npx use-npm-skills
```

```
+ awesome-memory (skill-awesome-memory@1.0.0) → .agents/skills
1 skill(s) in sync across .agents/skills
```

The skill is now a regular folder in your repo:

```
.agents/skills/
└── awesome-memory/
    ├── SKILL.md
    └── source.json    ← marks the skill as managed by use-npm-skills
```

Commit it.

> [!NOTE]
> The skill is plain files in your repo: teammates and agents get it from a fresh clone, with no install step. The package in `node_modules` is only where updates come from.

Requires Node 18+.

### Updating and removing skills

`use-npm-skills` itself never runs by itself — it installs no hooks ([why?](#faq)). Skill packages can opt into running it for you on install ([how](#automatic-installation)); for the ones that don't, and after removing a package (few package managers run uninstall scripts), run it again:

```shell
npm update skill-awesome-memory    && npx use-npm-skills   # update a skill
npm uninstall skill-awesome-memory && npx use-npm-skills   # remove a skill (its folder is cleaned up too)
```

Running it extra times is always safe — when everything is in sync, it does nothing.

### Your own skills, your own edits

Skills you wrote yourself (any skill folder without a `source.json`) are never touched.

If you edit an *installed* skill, `use-npm-skills` notices and refuses to overwrite you:

```
Warning: skill `awesome-memory` was modified locally — to keep your changes, remove
`skill-awesome-memory` or add it to `"exclude"` in `.use-npm-skills.json`; or run
`npx use-npm-skills --force` to override your changes
```

After you remove (or `exclude`) the package, the edited skill stays in your repo and becomes an ordinary skill of your own. And `--force` asks per skill before discarding anything.

### Where skills go

- **Your repo already has skills dirs?** They're detected and used — `skills/` at the root, or any `*/skills/` one level down that contains at least one skill: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, and whatever the next agent brings.
- **No skills dir yet?** `.agents/skills/` is created. If your agent only reads its own dir (say, `.claude/skills/`), list both in the [configuration](#configuration).
- **Several skills dirs?** Each skill is written once and mirrored into the others with relative symlinks (plain copies on Windows machines without [Git symlink support](https://stackoverflow.com/questions/5917249/git-symbolic-links-in-windows/59761201#59761201)). If your repo already mirrors skills differently — one dir symlinked to another, or duplicated copies — your existing layout is followed.
- **Monorepo, or a JavaScript project nested in a subdirectory?** Skills are installed at the Git repository root — where your agents look for them — whatever directory your lockfile and `node_modules/` live in (outside a Git repo: next to the nearest lockfile, or else in the current directory). Every `node_modules/` in the repo is crawled, so a skill package that only a workspace package or a nested project depends on is found too.

### Configuration

Optional — `.use-npm-skills.json` at the project root:

```json
{
  "skillsDirs": [".agents/skills", ".claude/skills"],
  "exclude": ["some-skill-package"]
}
```

- `skillsDirs`: use exactly these dirs instead of auto-detection.
- `exclude`: ignore an installed skill package, e.g. a dependency whose `skills/` directory isn't meant for your agents (its skills are removed — or kept as yours if you edited them).

## Publishing skills

A skill package is a normal npm package with its skills in a `skills/` directory — one subdirectory per skill, named after the skill:

```
skill-awesome-memory/
├── package.json
└── skills/
    └── awesome-memory/
        └── SKILL.md
```

```json
{
  "name": "skill-awesome-memory",
  "version": "1.0.0",
  "files": ["skills"]
}
```

```md
---
name: awesome-memory
description: Maintain a MEMORY.md of project learnings across sessions.
---

When you learn something about this project that isn't written down anywhere, ...
```

That's it — `npm publish`. The `skills/` directory is the only marker — no keyword, no manifest field — and it's the layout [skills-npm](https://github.com/antfu/skills-npm) established, so one package serves both tools. The **directory name** under `skills/` becomes the skill's folder name in the user's repo.

### Skills with more files

Everything in the skill's directory is installed — ship reference docs, scripts, templates next to the `SKILL.md`:

```
skill-awesome-memory/
├── package.json
└── skills/
    └── awesome-memory/
        ├── SKILL.md
        ├── reference.md
        └── templates/MEMORY.md
```

### Several skills in one package

A package can ship any number of skills — one subdirectory each. That's how a library ships the skills for using it, versioned together with the code they describe:

```
my-lib/
├── package.json
├── dist/
└── skills/
    ├── my-lib-setup/
    │   └── SKILL.md
    └── my-lib-testing/
        └── SKILL.md
```

```json
{
  "name": "my-lib",
  "files": ["dist", "skills"]
}
```

### Automatic installation

Optionally, let your package install its skills by itself:

```json
{
  "name": "skill-awesome-memory",
  "dependencies": { "use-npm-skills": "^0.1.0" },
  "scripts": {
    "postinstall": "use-npm-skills install-package",
    "uninstall": "use-npm-skills uninstall-package"
  }
}
```

`install-package` installs your package's skills — and nothing else — when your package is installed. It also checks the other installed skill packages and prints an error for every skill a run of `npx use-npm-skills` would change (missing, outdated, left over, edited), so a stale skills directory is caught at the next install. It never fails a local install (a failing `postinstall` would abort the whole install), but it does fail when the `CI` environment variable is set, so CI goes red. `uninstall-package` removes your package's skills — where the package manager runs uninstall scripts (npm 7+ and pnpm don't; the next `npx use-npm-skills` cleans up).

Three caveats: pnpm and Bun don't run dependencies' scripts until the user approves them; most package managers only show a dependency's script output when the script fails (npm needs `--foreground-scripts`), so locally the report is easy to miss and CI is where it reliably bites; and without the hooks your users simply run `npx use-npm-skills` after installing — say so in your README.

### Try it before publishing

Install your package into a scratch project straight from disk:

```shell
npm install --save-dev use-npm-skills ../skill-awesome-memory
npx use-npm-skills
```

## How it works

- Installed skills are real, committed files. Nothing is gitignored, and nothing in your repo points into `node_modules` — a fresh clone is fully skill-aware before anyone runs anything.
- Every installed skill carries a `source.json`: which package and version it came from, plus a content hash. The hash is how local edits are detected (line-ending changes from Git's `autocrlf` don't count). No `source.json` = your skill, hands off.
- Symlinks are only ever created between skills dirs — relative, so they survive cloning to any path.
- The tool itself has zero install hooks and zero runtime dependencies.
- The exit code is non-zero when locally-modified skills were found — handy in CI to catch drift.

The full design rationale lives in [DECISIONS.md](./DECISIONS.md).

## FAQ

**Why doesn't it run automatically on `npm install`?**
`use-npm-skills` itself has no install hook because package managers make that unreliable: pnpm and Bun block dependency postinstall scripts by default, npm doesn't re-fire them on updates, and hardly anything runs on uninstall. Automation that works half the time is worse than a command you can trust — so, like `prisma generate`, you run `npx use-npm-skills` explicitly. Skill packages can opt into hooks that call `use-npm-skills install-package` ([see above](#automatic-installation)) for their own skills; the explicit command stays the one that brings everything in sync. Bonus: a package with no scripts is one your supply-chain scanner and your security team don't need to worry about.

**Why install `use-npm-skills` itself?**
So `npx` runs your local copy: the tool that writes your skills is pinned by your lockfile like everything else — the whole team and CI sync with the same version, instead of `npx` prompting to download whatever the latest release happens to be.

**Why commit the skills instead of gitignoring them?**
An agent reading a fresh clone should see every skill without anyone running an install first.

**What if two installed packages provide a skill with the same name?**
The first package alphabetically wins; the other is skipped with a warning.

**Windows?**
Supported. When [Git symlink support](https://stackoverflow.com/questions/5917249/git-symbolic-links-in-windows/59761201#59761201) is available — `core.symlinks` enabled and symlink creation permitted (e.g. Developer Mode) — skills are mirrored with symlinks like on any other platform. Otherwise they're copied into each skills dir instead.

**Yarn PnP?**
Not supported (there's no `node_modules` to read skills from) — see [#7](https://github.com/brillout/use-npm-skills/issues/7).

## License

[MIT](./LICENSE)
