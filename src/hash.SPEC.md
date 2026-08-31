Defines a skill's content identity: the deterministic content hash that decides whether a materialized skill is up-to-date, locally modified, or safe to delete.

## Business logic — TL;DR

- **Deterministic content hash** - one SHA-256 over a skill's file paths and contents, independent of file order; `source.json` is excluded.
- **Line-ending tolerance** - CRLF and LF text are the same content; binary files are compared byte-for-byte.

## Business logic

### Deterministic content hash

#### Problem

Tamper protection and pruning both need to answer "is this materialized skill still exactly what the package shipped?" — reliably, across machines and operating systems.

#### Business logic

A skill's hash covers every file under its directory (subdirectories included, symlinked files read through): each file's relative path and content, processed in sorted path order so file-listing order never matters, with path and content contributions kept unambiguous (renaming `a/bc` to `ab/c` changes the hash). The tool's own `source.json` metadata file is excluded — it stores this very hash. Content that cannot be read (e.g. a dangling symlink inside the skill) makes the comparison fail, which callers treat as "locally modified" — erring towards keeping the user's files.

### Line-ending tolerance

#### Problem

Git's `core.autocrlf` gives Windows checkouts CRLF line endings; without tolerance, every skill on such a machine would look locally modified.

#### Business logic

For hashing, text file content is normalized CRLF→LF, so line-ending differences never count as a modification. A file containing a NUL byte is treated as binary and hashed byte-for-byte unchanged.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
