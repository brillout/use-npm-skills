Filesystem helper functions, no business logic: classify a path (directory, file, symlink, or missing) without following symlinks; existence checks; safe variants of resolving, listing, and JSON-reading that return a neutral value instead of throwing when the path is missing or unreadable; resolving a symlink one hop without requiring its target to exist; recursive deletion; converting paths to POSIX separators; displaying a path relative to the project root in messages; and writing a set of files (relative path → content, plus whether each is executable) into a directory, creating parent directories as needed and marking executable files with mode 755.

## Before modifying/creating SPEC.md files

You must always read and respect https://raw.githubusercontent.com/brillout/sdd/refs/heads/main/sdd.md
