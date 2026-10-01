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

The skill now shows up in your skills directory, as a symlink into the package:

```
.agents/skills/
└── awesome-memory -> ../../node_modules/skill-awesome-memory/skills/awesome-memory
```

Commit it. The link is relative, so it works wherever the repo is cloned — a teammate gets the skill with `npm install`, like any dependency.

Requires Node 18+.

### Updating and removing skills

Updating a skill is updating the package — the link points at whatever version is installed, so there is nothing else to do:

```shell
npm update skill-awesome-memory
```

`use-npm-skills` itself never runs by itself — it installs no hooks ([why?](#faq)). Skill packages can opt into running it for you when they're installed ([how](#automatic-installation)); for the ones that don't, and after removing a package (few package managers run uninstall scripts), run it again:

```shell
npm install --save-dev skill-other     && npx use-npm-skills   # add a skill
npm uninstall skill-awesome-memory     && npx use-npm-skills   # remove a skill (its link is cleaned up too)
```

Running it extra times is always safe — when everything is in sync, it does nothing.

### Your own skills

Anything in a skills directory that isn't a link into a package is yours: `use-npm-skills` never modifies or deletes it. If a skill of yours stands where an installed skill of the same name would go, yours wins and the installed one is skipped with a warning.

To make an installed skill your own — tweak a prompt, add a file — replace the link with a real copy of the skill's folder, then remove the package (or list it in `exclude`, see [configuration](#configuration)) so the tool stops reminding you about it.

### Where skills go

- **Your repo already has skills dirs?** They're detected and used — `skills/` at the root, or any `*/skills/` one level down that contains at least one skill: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, and whatever the next agent brings.
- **No skills dir yet?** `.agents/skills/` is created. If your agent only reads its own dir (say, `.claude/skills/`), list both in the [configuration](#configuration).
- **Several skills dirs?** Each skill is linked into every one of them. A skills dir that is itself a symlink to another counts once.
- **Monorepo, or a JavaScript project nested in a subdirectory?** Skills are installed at the Git repository root — where your agents look for them — whatever directory your lockfile and `node_modules/` live in (outside a Git repo: next to the nearest lockfile, or else in the current directory). Every `node_modules/` in the repo is crawled, so a skill package that only a workspace package or a nested project depends on is found too, and linked from there.

### Configuration

Optional — `.use-npm-skills.json` at the project root:

```json
{
  "skillsDirs": [".agents/skills", ".claude/skills"],
  "exclude": ["some-skill-package"]
}
```

- `skillsDirs`: use exactly these dirs instead of auto-detection.
- `exclude`: ignore an installed skill package, e.g. a dependency whose `skills/` directory isn't meant for your agents (its links are removed).

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

That's it — `npm publish`. The `skills/` directory is the only marker — no keyword, no manifest field — and it's the layout [skills-npm](https://github.com/antfu/skills-npm) established, so one package serves both tools. The **directory name** under `skills/` becomes the skill's name in the user's repo.

### Skills with more files

Everything in the skill's directory is part of the skill — ship reference docs, scripts, templates next to the `SKILL.md`:

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
  "peerDependencies": { "use-npm-skills": "*" },
  "scripts": {
    "postinstall": "use-npm-skills install-package",
    "uninstall": "use-npm-skills uninstall-package"
  }
}
```

Declare `use-npm-skills` as a peer dependency, not a dependency: npm, pnpm, and Bun install a missing peer dependency by themselves, and when the project already has `use-npm-skills` (the dev dependency the install instructions recommend), that copy runs your hook. The project, not your package, decides which version of the tool writes its skills directories — and there is exactly one.

`install-package` installs your package's skills — and nothing else — when your package is installed. It also checks the other installed skill packages and prints an error for every skill a run of `npx use-npm-skills` would change (missing, left over, or pointing elsewhere), so a stale skills directory is caught at the next install. It never fails a local install (a failing `postinstall` would abort the whole install), but it does fail when the `CI` environment variable is set, so CI goes red. `uninstall-package` removes your package's skills — where the package manager runs uninstall scripts (npm 7+ and pnpm don't; the next `npx use-npm-skills` cleans up).

Caveats: pnpm and Bun don't run dependencies' scripts until the user approves them; Yarn doesn't install peer dependencies, so a Yarn project needs `use-npm-skills` among its own dev dependencies; most package managers only show a dependency's script output when the script fails (npm needs `--foreground-scripts`), so locally the report is easy to miss and CI is where it reliably bites; and without the hooks your users simply run `npx use-npm-skills` after installing — say so in your README.

### Try it before publishing

Install your package into a scratch project straight from disk:

```shell
npm install --save-dev use-npm-skills ../skill-awesome-memory
npx use-npm-skills
```

## How it works

- Each installed skill is a relative symlink from the skills dir to the skill's directory inside its package: `.agents/skills/awesome-memory -> ../../node_modules/skill-awesome-memory/skills/awesome-memory`. The link goes through the package's top-level `node_modules/<package>/` path — never through a package manager's internal, versioned paths (pnpm's `node_modules/.pnpm/…`) — so it stays valid across updates and never needs rewriting.
- The links are committed with the repo; nothing is gitignored. A fresh clone has every skill as soon as `npm install` has run.
- Links into packages are the only thing the tool manages: it recognizes them by where they point, and removes them once their package no longer provides the skill. Everything else in a skills dir is yours.
- The tool itself has zero install hooks and zero runtime dependencies.

The full design rationale lives in [DECISIONS.md](./DECISIONS.md).

## FAQ

**Why doesn't it run automatically on `npm install`?**
`use-npm-skills` itself has no install hook because package managers make that unreliable: pnpm and Bun block dependency postinstall scripts by default, npm doesn't re-fire them on updates, and hardly anything runs on uninstall. Automation that works half the time is worse than a command you can trust — so, like `prisma generate`, you run `npx use-npm-skills` explicitly. Skill packages can opt into hooks that call `use-npm-skills install-package` ([see above](#automatic-installation)) for their own skills; the explicit command stays the one that brings everything in sync. Bonus: a package with no scripts is one your supply-chain scanner and your security team don't need to worry about.

**Why install `use-npm-skills` itself?**
So `npx` runs your local copy: the tool that writes your skills is pinned by your lockfile like everything else — the whole team and CI sync with the same version, instead of `npx` prompting to download whatever the latest release happens to be.

**Do I commit the links?**
Yes. They're tiny, relative, and with them a fresh clone has every skill right after `npm install` — nobody has to remember to run anything.

**What if two installed packages provide a skill with the same name?**
The first package alphabetically wins; the other is skipped with a warning.

**Windows?**
Supported. When [Git symlink support](https://stackoverflow.com/questions/5917249/git-symbolic-links-in-windows/59761201#59761201) is available — `core.symlinks` enabled and symlink creation permitted (e.g. Developer Mode) — skills are linked like on any other platform. Otherwise they're copied into each skills dir instead.

**Yarn PnP?**
Not supported (there's no `node_modules` to read skills from) — see [#7](https://github.com/brillout/use-npm-skills/issues/7).

## License

[MIT](./LICENSE)
