import path from 'node:path'
import { lstatType } from './fsUtils.js'

/**
 * The project root = the Git repository root: the nearest ancestor of cwd
 * (cwd included) containing a `.git` entry — a directory, or a file as in
 * Git worktrees and submodules. Skills dirs, the config file, and the package
 * crawl all hang off it: agents read their skills dirs at the repo root,
 * wherever the JavaScript workspace (lockfile, node_modules/) lives
 * (antfu/skills-npm#38).
 */
export function resolveProjectRoot(cwd: string): string | null {
  let dir = path.resolve(cwd)
  while (true) {
    if (lstatType(path.join(dir, '.git')) !== 'missing') return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
