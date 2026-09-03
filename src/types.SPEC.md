The shared vocabulary of the sync flow — type definitions and constants, no behavior. It fixes the names the rest of the code (and its consumers) use:

- The fixed names: the config file name (`.use-npm-skills.json`), the ownership metadata file name (`source.json`), and the default skills directory (`.agents/skills`).
- The data shapes: a skill of an installed skill package (the skill's name, its directory inside the package, and the npm name and version of the package shipping it), the contents of `source.json` (package, version, content hash), the config settings, the mirroring analysis (physical skills directories, mirror style symlink-or-copy, primary directory), and the sync result (project root, target directories, analysis, per-skill outcomes, warnings, exit code).
- The list of per-skill outcome kinds a run can report (see `src/SPEC.md`, "Reported outcome per skill").
- The distinction between usage errors — caused by the environment or how the tool is used, reported as a plain message without a stack trace — and unexpected errors (see `cli.SPEC.md`, "Friendly errors").

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
