import fs from 'node:fs'
import path from 'node:path'
import { hashFileMap, hashSkillDir, readDirFiles } from './hash.js'
import { isFile, lstatType, readJsonSafe, realpathSafe, relDisplay, rmrf, toPosix, writeFileMap } from './fsUtils.js'
import type { Logger } from './logger.js'
import { SOURCE_JSON, type Action, type Analysis, type SkillFile, type SkillPackage, type SourceMeta } from './types.js'

export type EntryState =
  | { type: 'missing' }
  | { type: 'file' } // a plain file where a skill dir would go — user's, never touched
  | { type: 'user-dir' } // real dir without source.json — user-authored, always wins
  | { type: 'owned-dir'; meta: SourceMeta; pristine: boolean }
  | { type: 'tool-link'; resolved: string } // symlink resolving to a dir that carries source.json
  | { type: 'user-link' } // symlink resolving to user-authored content
  | { type: 'dangling-link' }

/** Ownership: an entry is tool-owned iff it carries source.json (directly, or resolved through its symlink). */
export function classifyEntry(entryPath: string): EntryState {
  const type = lstatType(entryPath)
  if (type === 'missing') return { type: 'missing' }
  if (type === 'file') return { type: 'file' }
  if (type === 'symlink') {
    const resolved = realpathSafe(entryPath)
    if (!resolved) return { type: 'dangling-link' }
    if (readSourceMeta(resolved)) return { type: 'tool-link', resolved }
    return { type: 'user-link' }
  }
  const meta = readSourceMeta(entryPath)
  if (!meta) return { type: 'user-dir' }
  let pristine = false
  try {
    pristine = hashSkillDir(entryPath) === meta.hash
  } catch {
    // e.g. a dangling symlink inside the skill dir — count as modified
  }
  return { type: 'owned-dir', meta, pristine }
}

/**
 * Read a skill dir's source.json. A malformed one still marks the entry as
 * tool-owned (empty fields never match ⇒ treated as modified, and an empty
 * `package` is never installed ⇒ the entry ends up adopted).
 */
export function readSourceMeta(dir: string): SourceMeta | null {
  const sourceJsonPath = path.join(dir, SOURCE_JSON)
  const raw = readJsonSafe(sourceJsonPath)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return isFile(sourceJsonPath) ? { package: '', version: '', hash: '' } : null
  }
  const obj = raw as Record<string, unknown>
  return {
    package: typeof obj.package === 'string' ? obj.package : '',
    version: typeof obj.version === 'string' ? obj.version : '',
    hash: typeof obj.hash === 'string' ? obj.hash : '',
  }
}

/** The files a package's skill materializes to: the full contents of its skill/ directory. */
export function readPackageSkillFiles(pkg: SkillPackage, log: Logger): Map<string, SkillFile> {
  const files = readDirFiles(path.join(pkg.dir, 'skill'))
  if (files.has(SOURCE_JSON)) {
    files.delete(SOURCE_JSON)
    log.warn(`package \`${pkg.name}\`: skill/ ships a ${SOURCE_JSON} — ignored (reserved for use-npm-skills metadata)`)
  }
  return files
}

export function writeSkill(entryPath: string, files: Map<string, SkillFile>, meta: SourceMeta): void {
  fs.mkdirSync(entryPath, { recursive: true })
  writeFileMap(entryPath, files)
  writeSourceJson(entryPath, meta)
}

function writeSourceJson(entryPath: string, meta: SourceMeta): void {
  fs.writeFileSync(path.join(entryPath, SOURCE_JSON), JSON.stringify(meta, null, 2) + '\n')
}

export function tamperMessage(skillName: string, pkgName: string): string {
  return (
    `skill \`${skillName}\` was modified locally — to keep your changes, remove \`${pkgName}\` or add it to ` +
    `\`"exclude"\` in \`.use-npm-skills.json\`; or run \`npx use-npm-skills --force\` to override your changes`
  )
}

/** Skills whose local changes `--force` would overwrite — for listing/prompting before execution. */
export function listTampered(active: SkillPackage[], analysis: Analysis): { skill: string; package: string }[] {
  const activeNames = new Set(active.map((pkg) => pkg.name))
  const claimed = new Set<string>()
  const tampered: { skill: string; package: string }[] = []
  for (const pkg of active) {
    if (claimed.has(pkg.skillName)) continue
    claimed.add(pkg.skillName)
    for (const dir of analysis.physicalDirs) {
      const state = classifyEntry(path.join(dir, pkg.skillName))
      if (state.type === 'owned-dir' && !state.pristine && activeNames.has(state.meta.package)) {
        tampered.push({ skill: pkg.skillName, package: pkg.name })
        break
      }
    }
  }
  return tampered
}

export interface MaterializeContext {
  root: string
  active: SkillPackage[]
  analysis: Analysis
  force: boolean
  confirmOverwrite: (skillName: string, pkgName: string) => Promise<boolean> | boolean
  log: Logger
}

export async function materializeAll(ctx: MaterializeContext): Promise<{ actions: Action[]; tampered: boolean }> {
  const { root, active, analysis, force, log } = ctx
  const actions: Action[] = []
  let anyTamperedKept = false
  const claimed = new Map<string, string>()
  const activeNames = new Set(active.map((pkg) => pkg.name))
  const rel = (p: string) => relDisplay(root, p)

  for (const pkg of active) {
    // Skill-name collision between two installed packages: first alphabetically wins.
    const claimedBy = claimed.get(pkg.skillName)
    if (claimedBy) {
      log.warn(
        `skill name \`${pkg.skillName}\` is provided by both \`${claimedBy}\` and \`${pkg.name}\` — ` +
          `keeping \`${claimedBy}\`, skipping \`${pkg.name}\``,
      )
      actions.push({ kind: 'skipped-collision', skill: pkg.skillName, package: pkg.name })
      continue
    }
    claimed.set(pkg.skillName, pkg.name)

    let files: Map<string, SkillFile>
    try {
      files = readPackageSkillFiles(pkg, log)
    } catch (err) {
      log.warn(`package \`${pkg.name}\`: cannot read its skill files (${(err as Error).message}) — skipping`)
      continue
    }
    const desiredHash = hashFileMap(files)
    const meta: SourceMeta = { package: pkg.name, version: pkg.version, hash: desiredHash }

    const realDests = analysis.style === 'copy' ? analysis.physicalDirs : [analysis.primaryDir]
    const linkDests = analysis.style === 'copy' ? [] : analysis.physicalDirs.filter((d) => d !== analysis.primaryDir)

    // ---- Plan: classify every destination before touching anything.
    const states = new Map<string, EntryState>()
    for (const dir of [...realDests, ...linkDests]) states.set(dir, classifyEntry(path.join(dir, pkg.skillName)))

    // A modified entry whose owning package is gone is adopted (source.json
    // removed) — it becomes an ordinary user-authored skill and wins below.
    for (const [dir, state] of states) {
      if (state.type === 'owned-dir' && !state.pristine && !activeNames.has(state.meta.package)) {
        fs.rmSync(path.join(dir, pkg.skillName, SOURCE_JSON), { force: true })
        log.warn(
          `skill \`${pkg.skillName}\` in ${rel(dir)} was modified locally and its package ` +
            `\`${state.meta.package || '(unknown)'}\` is no longer installed — kept as a user-authored skill`,
        )
        states.set(dir, { type: 'user-dir' })
      }
    }

    // Tamper protection: a hash mismatch means the user edited the copy.
    const tamperedStates = [...states.values()].filter(
      (state): state is Extract<EntryState, { type: 'owned-dir' }> => state.type === 'owned-dir' && !state.pristine,
    )
    let forcedOverwrite = false
    if (tamperedStates.length > 0) {
      const owner = tamperedStates[0].meta.package || pkg.name
      const consented = force ? await ctx.confirmOverwrite(pkg.skillName, owner) : false
      if (!consented) {
        if (force) {
          log.info(`kept the local changes of skill \`${pkg.skillName}\``)
          actions.push({ kind: 'kept', skill: pkg.skillName, package: pkg.name })
        } else {
          log.warn(tamperMessage(pkg.skillName, owner))
          actions.push({ kind: 'tampered', skill: pkg.skillName, package: pkg.name })
          anyTamperedKept = true
        }
        continue // leave the whole skill untouched
      }
      forcedOverwrite = true
    }

    // ---- Execute: real destinations.
    const skippedUserOwned = (dir: string) => {
      log.warn(
        `skill \`${pkg.skillName}\` in ${rel(dir)} is user-authored (no ${SOURCE_JSON}) — ` +
          `skipping (package \`${pkg.name}\`); remove it if you want the package's version`,
      )
    }
    const writtenDirs: string[] = []
    let primaryBlocked = false
    let anyAdded = false
    let anyChanged = false

    for (const dir of realDests) {
      const state = states.get(dir)!
      const entryPath = path.join(dir, pkg.skillName)
      if (state.type === 'missing') {
        writeSkill(entryPath, files, meta)
        writtenDirs.push(dir)
        anyAdded = true
      } else if (state.type === 'dangling-link' || state.type === 'tool-link') {
        fs.unlinkSync(entryPath)
        writeSkill(entryPath, files, meta)
        writtenDirs.push(dir)
        anyChanged = true
      } else if (state.type === 'owned-dir') {
        if (!state.pristine) {
          // forcedOverwrite is guaranteed here
          rmrf(entryPath)
          writeSkill(entryPath, files, meta)
          writtenDirs.push(dir)
        } else if (
          state.meta.hash === desiredHash &&
          state.meta.package === pkg.name &&
          state.meta.version === pkg.version
        ) {
          writtenDirs.push(dir) // up-to-date
        } else if (state.meta.hash === desiredHash && state.meta.package === pkg.name) {
          writeSourceJson(entryPath, meta) // same content, new version — refresh metadata only
          writtenDirs.push(dir)
          anyChanged = true
        } else {
          rmrf(entryPath)
          writeSkill(entryPath, files, meta)
          writtenDirs.push(dir)
          anyChanged = true
        }
      } else {
        // file | user-dir | user-link: user-authored always wins
        skippedUserOwned(dir)
        if (analysis.style === 'symlink') primaryBlocked = true
      }
    }

    // ---- Execute: mirror symlinks (symlink style only).
    if (!primaryBlocked) {
      const primaryEntry = path.join(analysis.primaryDir, pkg.skillName)
      const makeLink = (mirrorDir: string, linkPath: string) => {
        fs.mkdirSync(mirrorDir, { recursive: true })
        const target = toPosix(path.relative(mirrorDir, primaryEntry))
        try {
          fs.symlinkSync(target, linkPath, 'dir')
        } catch (err) {
          log.warn(`cannot create symlink ${rel(linkPath)} (${(err as Error).message}) — falling back to a copy`)
          writeSkill(linkPath, files, meta)
        }
        anyChanged = true
      }
      for (const dir of linkDests) {
        const state = states.get(dir)!
        const linkPath = path.join(dir, pkg.skillName)
        if (state.type === 'missing') {
          makeLink(dir, linkPath)
        } else if (state.type === 'dangling-link') {
          fs.unlinkSync(linkPath)
          makeLink(dir, linkPath)
        } else if (state.type === 'tool-link') {
          if (realpathSafe(linkPath) !== realpathSafe(primaryEntry)) {
            fs.unlinkSync(linkPath)
            makeLink(dir, linkPath)
          }
        } else if (state.type === 'owned-dir') {
          // A real copy where the pattern wants a link (style migration, or a
          // force-consented modified copy): replace with a link.
          rmrf(linkPath)
          makeLink(dir, linkPath)
        } else {
          skippedUserOwned(dir)
        }
      }
    }

    // ---- Report.
    if (writtenDirs.length === 0) {
      actions.push({ kind: 'skipped-user-owned', skill: pkg.skillName, package: pkg.name })
      continue
    }
    const where = writtenDirs.map(rel).join(', ')
    if (forcedOverwrite) {
      log.info(
        `overwrote the local changes of skill \`${pkg.skillName}\` (${pkg.name}@${pkg.version}) — consider ` +
          `removing \`${pkg.name}\` — or adding it to \`exclude\` — if you want to keep your changes`,
      )
      actions.push({ kind: 'forced', skill: pkg.skillName, package: pkg.name, detail: where })
    } else if (anyAdded) {
      log.info(`+ ${pkg.skillName} (${pkg.name}@${pkg.version}) → ${where}`)
      actions.push({ kind: 'added', skill: pkg.skillName, package: pkg.name, detail: where })
    } else if (anyChanged) {
      log.info(`~ ${pkg.skillName} (${pkg.name}@${pkg.version}) updated in ${where}`)
      actions.push({ kind: 'updated', skill: pkg.skillName, package: pkg.name, detail: where })
    } else {
      actions.push({ kind: 'up-to-date', skill: pkg.skillName, package: pkg.name, detail: where })
    }
  }

  return { actions, tampered: anyTamperedKept }
}
