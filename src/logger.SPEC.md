Message reporting infrastructure, no business logic: collects every info and warning message of a run (so the sync result can return them to library users, and tests can assert on them) and prints them as they happen — warnings prefixed with `Warning:` — unless quiet mode is on (used by tests).

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
