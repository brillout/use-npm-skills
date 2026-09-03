Reads and validates the project's optional config file `.use-npm-skills.json` at the project root.

## Business logic — TL;DR

- **Three settings** - `mode` (how skills are materialized: symlinks into the packages, or copies), `skillsDirs` (replace skills-directory discovery), and `exclude` (skip installed skill packages by name).
- **Strict validation** - malformed config is a usage error; `mode` must be one of the two known modes; `skillsDirs` entries must lie inside the project; unknown keys warn.

## Business logic

### Three settings

#### User story

The developer wants skills copied into the repository rather than symlinked into `node_modules/`, wants to pin exactly which skills directories are used, or wants to keep a skill package installed without materializing its skills (see `sync.SPEC.md`, "Config exclusion").

#### Business logic

The config file supports exactly three settings, all optional (as is the file itself): `mode`, either `"symlink"` (the default: each skill is a symlink to its directory inside the package) or `"copy"` (each skill is a copy of its files; see `analyze.SPEC.md`); `skillsDirs`, a list of directory paths relative to the project root that replaces skills-directory discovery entirely (see `targets.SPEC.md`); and `exclude`, a list of npm package names whose skills are not materialized.

### Strict validation

#### Problem

A silently misread config would make the tool write skills to the wrong place or overwrite something the user meant to protect.

#### Business logic

A config file that is not valid JSON, not a JSON object, whose `mode` is anything but `"symlink"` or `"copy"`, or whose list settings are not arrays of strings is a usage error. A `skillsDirs` entry pointing outside the project, or at the project root itself, is a usage error. Unknown keys produce a warning naming the key (catching typos like `skillsDir`) and are ignored.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
