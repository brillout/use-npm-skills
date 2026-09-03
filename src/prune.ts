import fs from 'node:fs'
import path from 'node:path'
import { lstatType, readdirSafe, relDisplay, resolveLinkTarget, rmrf } from './fsUtils.js'
import type { Logger } from './logger.js'
import { classifyEntry } from './materialize.js'
import { SOURCE_JSON, type Action } from './types.js'

export interface Orphan {
  dir: string
  name: string
  package: string
  /** A package link, or a copy whose content still matches its source.json — safe to delete. */
  pristine: boolean
}

/**
 * The tool-owned entries in `physicalDirs` — package links (dangling or not)
 * and copies carrying a source.json — that `isOrphan` disowns, given the
 * package and skill name the entry records: for a sync, those whose package
 * no longer provides them (uninstalled, excluded, or it dropped the skill);
 * for uninstall-package, those recorded as coming from that package.
 */
export function listOrphans(physicalDirs: string[], isOrphan: (pkg: string, skill: string) => boolean): Orphan[] {
  const orphans: Orphan[] = []
  for (const dir of physicalDirs) {
    for (const name of readdirSafe(dir)) {
      const state = classifyEntry(path.join(dir, name))
      if (state.type === 'owned-dir' && isOrphan(state.meta.package, name)) {
        orphans.push({ dir, name, package: state.meta.package, pristine: state.pristine })
      } else if (state.type === 'package-link' && isOrphan(state.package, state.skill)) {
        orphans.push({ dir, name, package: state.package, pristine: true })
      }
    }
  }
  return orphans
}

/**
 * Pristine orphans ⇒ deleted (a link: the link itself), a copy's mirror
 * symlinks included. Modified copies ⇒ adopted: only the source.json is
 * removed, so the dir becomes an ordinary user-authored skill — honoring the
 * tamper message's promise that removing the package keeps your changes.
 */
export function pruneOrphans(
  root: string,
  physicalDirs: string[],
  isOrphan: (pkg: string, skill: string) => boolean,
  log: Logger,
): Action[] {
  const actions: Action[] = []
  const deleted: string[] = []
  const removed = new Map<string, Action>() // one action per skill, whatever the number of dirs it was removed from
  for (const orphan of listOrphans(physicalDirs, isOrphan)) {
    const entryPath = path.join(orphan.dir, orphan.name)
    const owner = `\`${orphan.package || '(unknown)'}\``
    if (orphan.pristine) {
      rmrf(entryPath)
      deleted.push(entryPath)
      log.info(`- ${orphan.name} removed from ${relDisplay(root, orphan.dir)} (${owner} no longer provides it)`)
      const key = `${orphan.package}\0${orphan.name}`
      const action = removed.get(key) ?? { kind: 'removed', skill: orphan.name, package: orphan.package, detail: '' }
      action.detail = [action.detail, relDisplay(root, orphan.dir)].filter(Boolean).join(', ')
      if (!removed.has(key)) {
        removed.set(key, action)
        actions.push(action)
      }
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
