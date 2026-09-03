The `npx use-npm-skills` command: parses the command line, runs sync (see `sync.SPEC.md`), and turns its result into terminal output and an exit code.

## Business logic — TL;DR

- **Command-line surface** - no arguments runs sync; `install-package` and `uninstall-package` are the package-hook commands; `--force`, `--help`, `--version`; anything else is an error.
- **Interactive `--force` confirmation** - in a terminal, each locally modified skill is confirmed before being overwritten; outside a terminal, all are overwritten.
- **Friendly errors** - usage errors are printed as one-line messages with exit code 1; unexpected errors keep their stack trace.

## Business logic

### Command-line surface

#### User story

The developer runs `npx use-npm-skills` after adding, updating, or removing skill packages.

#### Business logic

Running the command with no arguments performs sync. `--force` (or `-f`) additionally overwrites locally modified skills. The commands `install-package` and `uninstall-package` (see `hooks.SPEC.md`) run the package hooks; they take no options, so `--force` with them is an error. `--help` (or `-h`) prints usage — the commands included — the config file format, and a link to the documentation; `--version` (or `-v`) prints the tool's version; both exit without doing anything else. Any other argument or command prints an error plus the usage text and exits with code 1. The exit code of a sync run is the sync result's exit code: 0 on success, non-zero when locally modified skills were found and left untouched; the exit code of a hook command is the hook's: `install-package` exits with code 1 only when it found a bad state and the `CI` environment variable is set.

### Interactive `--force` confirmation

#### User story

The developer runs `npx use-npm-skills --force` to overwrite skills they edited locally, but wants to decide per skill rather than lose all edits at once.

#### Business logic

With `--force`, the command first lists every locally modified skill whose changes would be lost. When both input and output are an interactive terminal, it then asks per skill "overwrite the local changes of skill `<name>`? [y/N]" — only an explicit yes overwrites; the default is no. Outside an interactive terminal (e.g. CI), no questions are asked and all listed skills are overwritten.

### Friendly errors

#### Problem

Errors caused by the environment or by how the tool is used (no `node_modules/`, invalid config) are the user's to fix; a stack trace would only obscure the message.

#### Business logic

Usage errors are printed as a single `Error: <message>` line and exit with code 1. Any other (unexpected) error propagates with its stack trace.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
