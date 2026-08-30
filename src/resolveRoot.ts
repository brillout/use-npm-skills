import path from 'node:path'
import { isFile } from './fsUtils.js'

const LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]

/**
 * Walk up from cwd to the nearest directory containing a lockfile — in
 * monorepos that's the workspace root, where skills belong.
 */
export function resolveProjectRoot(cwd: string): { root: string; lockfile: string } | null {
  let dir = path.resolve(cwd)
  while (true) {
    for (const lockfile of LOCKFILES) {
      if (isFile(path.join(dir, lockfile))) return { root: dir, lockfile }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
