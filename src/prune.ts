import fs from 'node:fs'
import path from 'node:path'
import { hashSkillDir } from './hash.js'
import { lstatType, readdirSafe, relDisplay, resolveLinkTarget, rmrf } from './fsUtils.js'
import type { Logger } from './logger.js'
import { readSourceMeta } from './materialize.js'
import { SOURCE_JSON, type Action, type SkillPackage } from './types.js'

/**
 * An orphan = a tool-owned entry (has source.json) whose package no longer
 * materializes it. Pristine ⇒ delete it and its mirror symlinks. Modified ⇒
 * adopt: remove only the source.json, so the dir becomes an ordinary
 * user-authored skill — honoring the tamper message's promise that removing
 * the package keeps your changes.
 */
export function pruneOrphans(root: string, physicalDirs: string[], active: SkillPackage[], log: Logger): Action[] {
  const actions: Action[] = []
  const skillNameByPackage = new Map(active.map((pkg) => [pkg.name, pkg.skillName]))
  const deleted: string[] = []
  const links: { linkPath: string; target: string }[] = []

  for (const dir of physicalDirs) {
    for (const name of readdirSafe(dir)) {
      const entryPath = path.join(dir, name)
      const type = lstatType(entryPath)
      if (type === 'symlink') {
        const target = resolveLinkTarget(entryPath)
        if (target) links.push({ linkPath: entryPath, target })
        continue
      }
      if (type !== 'dir') continue
      const meta = readSourceMeta(entryPath)
      if (!meta) continue // user-authored — not ours to touch
      if (skillNameByPackage.get(meta.package) === name) continue // still owned

      let pristine = false
      try {
        pristine = hashSkillDir(entryPath) === meta.hash
      } catch {
        // unreadable content — count as modified, i.e. adopt rather than delete
      }
      if (pristine) {
        rmrf(entryPath)
        deleted.push(entryPath)
        log.info(`- ${name} removed from ${relDisplay(root, dir)} (\`${meta.package || '(unknown)'}\` is no longer installed)`)
        actions.push({ kind: 'removed', skill: name, package: meta.package })
      } else {
        fs.rmSync(path.join(entryPath, SOURCE_JSON), { force: true })
        log.warn(
          `skill \`${name}\` in ${relDisplay(root, dir)} was modified locally and its package ` +
            `\`${meta.package || '(unknown)'}\` is no longer installed — kept as a user-authored skill`,
        )
        actions.push({ kind: 'adopted', skill: name, package: meta.package })
      }
    }
  }

  // Remove the mirror symlinks of deleted orphans.
  for (const { linkPath, target } of links) {
    if (deleted.some((d) => target === d || target.startsWith(d + path.sep))) {
      try {
        fs.unlinkSync(linkPath)
      } catch {
        // already gone — fine
      }
    }
  }

  return actions
}
