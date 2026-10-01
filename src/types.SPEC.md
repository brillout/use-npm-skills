The shared vocabulary of the sync flow — type definitions and constants, no behavior. It fixes the names the rest of the code (and its consumers) use:

- The fixed names: the config file name (`.use-npm-skills.json`), the metadata file name of a copied skill (`source.json`), the default skills directory (`.agents/skills`), and the default mode (symlink).
- The two modes a skill can be materialized in: symlink mode (a symlink into the package) and copy mode (a copy of its files).
- The data shapes: a skill of an installed skill package (the skill's name, its directory inside the package — through the package's stable top-level `node_modules/` path — and the npm name and version of the package shipping it), the contents of `source.json` (package, version, content hash), the config settings (mode, skills directories, excluded packages), the layout decided for a run (the physical skills directories and the mode; in copy mode also the mirror style symlink-or-copy and the primary directory), and the sync result (project root, target directories, layout, per-skill outcomes, warnings, exit code).
- The list of per-skill outcome kinds a run can report (see `src/SPEC.md`, "Reported outcome per skill").
- The distinction between usage errors — caused by the environment or how the tool is used, reported as a plain message without a stack trace — and unexpected errors (see `cli.SPEC.md`, "Friendly errors").

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
