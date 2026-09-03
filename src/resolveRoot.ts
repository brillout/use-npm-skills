import path from 'node:path'
import { isFile, lstatType } from './fsUtils.js'

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']

/**
 * The project root: the Git repository root — the nearest ancestor of cwd
 * (cwd included) containing a `.git` entry, a directory or a file as in Git
 * worktrees and submodules — or, outside a Git repository, the nearest
 * ancestor containing a package-manager lockfile, or, failing that, cwd
 * itself. Skills dirs, the config file, and the package crawl all hang off
 * it: agents read their skills dirs at the repo root, wherever the JavaScript
 * workspace (lockfile, node_modules/) lives (antfu/skills-npm#38).
 */
export function resolveProjectRoot(cwd: string): string {
  const start = path.resolve(cwd)
  return (
    findUp(start, (dir) => lstatType(path.join(dir, '.git')) !== 'missing') ??
    findUp(start, (dir) => LOCKFILES.some((lockfile) => isFile(path.join(dir, lockfile)))) ??
    start
  )
}

/** The nearest directory, walking up from `start` (included), that `matches` — or null. */
function findUp(start: string, matches: (dir: string) => boolean): string | null {
  let dir = start
  while (true) {
    if (matches(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
