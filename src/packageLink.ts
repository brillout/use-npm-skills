import path from 'node:path'
import { resolveLinkTarget, toPosix } from './fsUtils.js'
import type { PackageSkill } from './types.js'

/**
 * A package link is what symlink mode materializes: `<skills dir>/<name>` is
 * a symlink straight to the skill's directory inside its package,
 * `<node_modules>/<package>/skills/<name>`. Relative, so it survives cloning
 * the repo to any path; through the package's stable top-level
 * `node_modules/` entry — never pnpm's versioned
 * `node_modules/.pnpm/<package>@<version>/…` path — so updating the package
 * changes what the link shows without changing the link.
 */
export function packageLinkTarget(skillsDir: string, skill: PackageSkill): string {
  return toPosix(path.relative(skillsDir, skill.dir))
}

export interface PackageLink {
  package: string
  skill: string
  /** Absolute path the link points at (resolved one hop, not through further symlinks; may not exist). */
  target: string
}

/**
 * Recognize a package link by the shape of its target,
 * `…/node_modules/<package>/skills/<skill>` — whether or not the target
 * exists: after the package is uninstalled the link dangles, and its target
 * still tells which package it came from. Null for anything that is not a
 * symlink, or a symlink to anywhere else.
 */
export function readPackageLink(linkPath: string): PackageLink | null {
  const target = resolveLinkTarget(linkPath)
  if (!target) return null
  const parts = target.split(path.sep)
  const nodeModules = parts.lastIndexOf('node_modules')
  if (nodeModules === -1) return null
  const rest = parts.slice(nodeModules + 1)
  const packageParts = rest[0]?.startsWith('@') ? 2 : 1
  if (rest.length !== packageParts + 2 || rest[packageParts] !== 'skills') return null
  return { package: rest.slice(0, packageParts).join('/'), skill: rest[packageParts + 1], target }
}
