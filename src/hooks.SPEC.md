The two commands a skill package's own lifecycle scripts run, so that installing the package installs its skills without the developer running `npx use-npm-skills`: `install-package` (from `postinstall`) materializes the skills of that one package and reports the other packages' skills that are out of sync [1]; `uninstall-package` (from `uninstall`) removes that one package's skills. Neither touches another package's skills.

## Glossary

[1] out of sync: a skill's materialization differs from what a run of `npx use-npm-skills` (`sync.SPEC.md`) would leave — the skill is missing, outdated (its entry points elsewhere, or in copy mode holds another package, version, or content), left over from a package that no longer provides it, or (copy mode) modified locally.

## Business logic — TL;DR

- **The package is the working directory** - the commands act on the package whose directory they run in, which is how package managers run lifecycle scripts; the project root is resolved from the project that package is installed in, and the package's skills are what the crawl finds for it there.
- **Install one package's skills, report the others'** - `install-package` materializes only its package's skills, then reports every other package's skill that is out of sync [1] without fixing it.
- **Never interrupt a local install; fail in CI** - a bad state is printed as errors; the command fails only when the `CI` environment variable is set.
- **Uninstall one package's skills** - `uninstall-package` removes only its package's skills, adopting locally modified ones.

## Business logic

### The package is the working directory

#### User story

The skill author adds `"postinstall": "use-npm-skills install-package"` — and, optionally, an `uninstall` script running `use-npm-skills uninstall-package` — to their package, plus `use-npm-skills` as a peer dependency; the developer installing the package gets its skills without running anything.

#### Business logic

Package managers run a package's lifecycle scripts in that package's directory, so both commands take the package from the working directory's `package.json` (its name). A working directory without a `package.json` naming a package is a usage error. The project root (`resolveRoot.SPEC.md`) is resolved from the directory above the outermost `node_modules/` in the package's path — the project it is installed in, wherever the package manager keeps the package's files (pnpm runs scripts inside its virtual store, `node_modules/.pnpm/…`) — or, when the package is not inside a `node_modules/`, from the package's own directory. The package's skills are the ones the crawl (`enumerate.SPEC.md`) finds for that package from the project root, not the working directory's `skills/`: for a package the crawl does not see — a transitive dependency pnpm keeps out of the project's `node_modules/`, or the package's own repository, whose `npm install` runs its `postinstall` too — `install-package` installs nothing and says so. The copy of the tool the package manager puts on the script's path runs the hook: the project's own `use-npm-skills` when it has one, otherwise the one npm, pnpm, and Bun install for a missing peer dependency (Yarn installs none, so a Yarn project needs its own).

#### Rationale

Package managers link every dependency into `node_modules/` before running any `postinstall` — npm and pnpm alike, pnpm's virtual store included — so the crawl always sees an installed package. Taking the skills from the working directory instead would install, for a package a full sync does not see, skills that the next sync prunes as left over. A peer dependency, not a dependency, keeps one copy of the tool per project, of the version the project chose: a dependency would give every skill package its own copy, of whatever version it pinned, all writing the same skills directories.

### Install one package's skills, report the others'

#### User story

Developer: `npm install skill-awesome-memory` puts the skill in my repository straight away — and if I had forgotten to run `npx use-npm-skills` after some earlier change, the install tells me so.

#### Business logic

`install-package` materializes its package's skills exactly as a full sync would (`materialize.SPEC.md`: mirroring, tamper protection, name collisions decided over all installed skills, the config file's `exclude` honored — an excluded package installs nothing), but writes nothing for any other package. It then reports, as errors, each skill of another installed package that is out of sync [1] — the skills a full sync would materialize, name collisions resolved the same way — every entry left over from a package that no longer provides it, and its own locally modified skills, followed by the remedy: run `npx use-npm-skills`. User-authored content standing in a skill's way is not out of sync: a full sync leaves it alone too.

#### Rationale

The command never touches another package's skills by design: each hooked package is responsible for its own, and an install is not the moment to rewrite the repository's skills wholesale. Reporting what is off on every install catches a stale skills directory as early as possible — before it is committed, or in CI once it is.

### Never interrupt a local install; fail in CI

#### Problem

A failing `postinstall` script aborts the whole install and skips the other packages' `postinstall` scripts — the very ones that would install the skills reported missing — so the install could never succeed again: a deadlock. Yet a stale skills directory should not go unnoticed.

#### Business logic

A bad state never fails the command in a normal environment: the errors are printed, the command says it is not failing the install, and exits with code 0. When the `CI` environment variable is set — to anything but `false`, the convention CI services follow — the same bad state makes the command exit with code 1, so the package manager's install — and the CI job — fails.

#### Rationale

In a fresh CI checkout the skills directories are exactly what was committed, so the check is accurate there and a red job points at the commit that forgot to run the tool; locally, the install must go through so that every package's own hook can run. Locally the report is also easy to miss — most package managers show a dependency's script output only when the script fails (npm needs `--foreground-scripts`) — so the exit code in CI is what reliably catches a bad state.

### Uninstall one package's skills

#### User story

Developer: `npm uninstall skill-awesome-memory` removes the skill from my repository — where the package manager runs uninstall scripts.

#### Business logic

`uninstall-package` removes its package's materialized skills as a full sync's pruning would (`prune.SPEC.md`): links and pristine copies are deleted (a copy together with its mirror symlinks), locally modified copies are adopted as user-authored skills. Nothing else is touched.

#### Rationale

Not every package manager runs uninstall scripts (npm 7+ and pnpm don't); where it doesn't, the next `npx use-npm-skills` — or the next `install-package` report — catches the leftover.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
