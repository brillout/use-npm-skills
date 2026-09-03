import fs from 'node:fs'
import path from 'node:path'
import { hashSkillDir } from './hash.js'
import { lstatType, readdirSafe, relDisplay, resolveLinkTarget, rmrf } from './fsUtils.js'
import type { Logger } from './logger.js'
import { readSourceMeta } from './materialize.js'
import { SOURCE_JSON, type Action, type SourceMeta } from './types.js'

export interface Orphan {
  dir: string
  name: string
  package: string
  pristine: boolean
}

/**
 * The tool-owned entries (they carry a source.json) in `physicalDirs` that
 * `isOrphan` disowns: for a sync, those whose recorded package no longer
 * provides them (uninstalled, excluded, or it dropped the skill); for
 * uninstall-package, those recorded as coming from that package.
 */
export function listOrphans(physicalDirs: string[], isOrphan: (meta: SourceMeta, name: string) => boolean): Orphan[] {
  const orphans: Orphan[] = []
  for (const dir of physicalDirs) {
    for (const name of readdirSafe(dir)) {
      const entryPath = path.join(dir, name)
      if (lstatType(entryPath) !== 'dir') continue // symlinks are mirrors, user-authored entries are not ours
      const meta = readSourceMeta(entryPath)
      if (!meta || !isOrphan(meta, name)) continue
      let pristine = false
      try {
        pristine = hashSkillDir(entryPath) === meta.hash
      } catch {
        // unreadable content — count as modified, i.e. adopt rather than delete
      }
      orphans.push({ dir, name, package: meta.package, pristine })
    }
  }
  return orphans
}

/**
 * Pristine orphans ⇒ deleted, mirror symlinks included. Modified ⇒ adopted:
 * only the source.json is removed, so the dir becomes an ordinary
 * user-authored skill — honoring the tamper message's promise that removing
 * the package keeps your changes.
 */
export function pruneOrphans(
  root: string,
  physicalDirs: string[],
  isOrphan: (meta: SourceMeta, name: string) => boolean,
  log: Logger,
): Action[] {
  const actions: Action[] = []
  const deleted: string[] = []
  for (const orphan of listOrphans(physicalDirs, isOrphan)) {
    const entryPath = path.join(orphan.dir, orphan.name)
    const owner = `\`${orphan.package || '(unknown)'}\``
    if (orphan.pristine) {
      rmrf(entryPath)
      deleted.push(entryPath)
      log.info(`- ${orphan.name} removed from ${relDisplay(root, orphan.dir)} (${owner} no longer provides it)`)
      actions.push({ kind: 'removed', skill: orphan.name, package: orphan.package })
    } else {
      fs.rmSync(path.join(entryPath, SOURCE_JSON), { force: true })
      log.warn(
        `skill \`${orphan.name}\` in ${relDisplay(root, orphan.dir)} was modified locally and its package ${owner} ` +
          `no longer provides it — kept as a user-authored skill`,
      )
      actions.push({ kind: 'adopted', skill: orphan.name, package: orphan.package })
    }
  }

  // Remove the mirror symlinks of deleted orphans.
  if (deleted.length > 0) {
    for (const dir of physicalDirs) {
      for (const name of readdirSafe(dir)) {
        const linkPath = path.join(dir, name)
        if (lstatType(linkPath) !== 'symlink') continue
        const target = resolveLinkTarget(linkPath)
        if (target && deleted.some((d) => target === d || target.startsWith(d + path.sep))) {
          try {
            fs.unlinkSync(linkPath)
          } catch {
            // already gone — fine
          }
        }
      }
    }
  }
  return actions
}
