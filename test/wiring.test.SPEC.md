What these tests cover — postinstall automation:

- An explicit run adds the root postinstall hook when the stamp is absent, and announces how
  to opt out.
- A fresh stamp (newer than the lockfile): no hook is added, `package.json` stays untouched.
- A stale stamp (older than the lockfile): the hook is added.
- An existing postinstall script gets the hook appended, with a warning asking the developer
  to double-check the merged script.
- A postinstall script that already runs `use-npm-skills` is left byte-for-byte alone.
- The `postinstall: false` configuration: no hook is added (explicit syncs still work), and
  lifecycle runs do nothing.
- Lifecycle runs never modify `package.json`, and operate on the project where the package
  manager was invoked rather than where the script happens to run.
- `package.json` rewrites preserve formatting: indentation, key order, trailing newline.
- The package's own install script writes the stamp and syncs, without adding the hook.
- The package's own install script does nothing on global installs.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
