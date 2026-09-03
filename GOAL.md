# `use-npm-skills`

Make npm the distribution channel for AI-agent skills (the agentskills.io `SKILL.md`
convention).

Today skills are distributed by copy-paste: installers clone files from GitHub into your
repo, updates are manual, and nothing ties the skill you have to a version anyone can
name. npm already solves all of this for code — semver, lockfiles, updates,
deprecations. Skills should get the same treatment.

- **Authors** publish skills as normal npm packages — a dedicated skill package, or a library
  shipping the skills for using it — and maintain them like any package.
- **Users** get skills like any dependency: install the package, run
  `npx use-npm-skills`, and the skill shows up where their agents look for skills.
  Upgrading a skill is `npm update` + re-run; the lockfile pins exactly which skill
  content the whole team has.

One npm package delivers this: `use-npm-skills`
(https://github.com/brillout/use-npm-skills).
