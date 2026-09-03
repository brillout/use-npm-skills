import fs from 'node:fs'
import path from 'node:path'
import { hashFileMap, hashSkillDir, readDirFiles } from './hash.js'
import { isFile, lstatType, readJsonSafe, realpathSafe, relDisplay, rmrf, toPosix, writeFileMap } from './fsUtils.js'
import type { Logger } from './logger.js'
import { packageLinkTarget, readPackageLink } from './packageLink.js'
import { SOURCE_JSON, type Action, type Analysis, type PackageSkill, type SourceMeta } from './types.js'

export type EntryState =
  | { type: 'missing' }
  | { type: 'file' } // a plain file where a skill would go — the user's, never touched
  | { type: 'user-dir' } // a real dir without source.json — user-authored, always wins
  | { type: 'owned-dir'; meta: SourceMeta; pristine: boolean } // a copy written by the tool
  | { type: 'package-link'; package: string; skill: string; target: string } // a symlink into a package's skills/ — dangling or not
  | { type: 'mirror-link'; resolved: string } // a symlink resolving to a copy written by the tool
  | { type: 'user-link' } // a symlink resolving to user-authored content
  | { type: 'dangling-link' } // a symlink to nowhere that is not a package link

/**
 * Ownership: an entry is tool-owned iff it is a package link or a copy
 * carrying source.json (directly, or resolved through its symlink).
 */
export function classifyEntry(entryPath: string): EntryState {
  const type = lstatType(entryPath)
  if (type === 'missing') return { type: 'missing' }
  if (type === 'file') return { type: 'file' }
  if (type === 'symlink') {
    const packageLink = readPackageLink(entryPath)
    if (packageLink) return { type: 'package-link', ...packageLink }
    const resolved = realpathSafe(entryPath)
    if (!resolved) return { type: 'dangling-link' }
    if (readSourceMeta(resolved)) return { type: 'mirror-link', resolved }
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

/** User-authored content — a hand-written dir, a plain file, a symlink to user content — always wins. */
function isUserContent(state: EntryState): boolean {
  return state.type === 'file' || state.type === 'user-dir' || state.type === 'user-link'
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

/** What a copy of a skill consists of: the full contents of its directory in the package, and the metadata recording them. */
interface Copy {
  files: Map<string, Buffer>
  meta: SourceMeta
}

function readCopy(skill: PackageSkill, log: Logger): Copy {
  const files = readDirFiles(skill.dir)
  if (files.has(SOURCE_JSON)) {
    files.delete(SOURCE_JSON)
    log.warn(
      `package \`${skill.package}\`: skills/${skill.name}/ ships a ${SOURCE_JSON} — ignored ` +
        `(reserved for use-npm-skills metadata)`,
    )
  }
  return { files, meta: { package: skill.package, version: skill.version, hash: hashFileMap(files) } }
}

function sameMeta(a: SourceMeta, b: SourceMeta): boolean {
  return a.package === b.package && a.version === b.version && a.hash === b.hash
}

/**
 * Whether the installed skill package `pkgName` still ships a skill named
 * `skillName` — i.e. still owns a materialized entry recorded as coming from it.
 */
export function stillProvided(active: PackageSkill[], pkgName: string, skillName: string): boolean {
  return active.some((skill) => skill.package === pkgName && skill.name === skillName)
}

/**
 * What a physical skills dir holds for a skill under the layout: the skill's
 * files (a copy), a mirror link to the primary dir's copy, or a package link.
 */
type Destination =
  | { dir: string; entryPath: string; want: 'files' }
  | { dir: string; entryPath: string; want: 'mirror-link' | 'package-link'; linkTarget: string }

/** A skill's destinations — the one holding files first, so mirrors have something to link to. */
function destinations(analysis: Analysis, skill: PackageSkill): Destination[] {
  const entry = (dir: string) => path.join(dir, skill.name)
  if (analysis.mode === 'symlink') {
    return analysis.physicalDirs.map(
      (dir): Destination => ({ dir, entryPath: entry(dir), want: 'package-link', linkTarget: packageLinkTarget(dir, skill) }),
    )
  }
  if (analysis.style === 'copy') {
    return analysis.physicalDirs.map((dir): Destination => ({ dir, entryPath: entry(dir), want: 'files' }))
  }
  const primaryEntry = entry(analysis.primaryDir)
  return [
    { dir: analysis.primaryDir, entryPath: primaryEntry, want: 'files' },
    ...analysis.physicalDirs
      .filter((dir) => dir !== analysis.primaryDir)
      .map(
        (dir): Destination => ({
          dir,
          entryPath: entry(dir),
          want: 'mirror-link',
          linkTarget: toPosix(path.relative(dir, primaryEntry)),
        }),
      ),
  ]
}

/** Whether the entry is exactly what a sync leaves at the destination. */
function isCurrent(state: EntryState, dest: Destination, copy: Copy | undefined): boolean {
  if (dest.want === 'files') {
    return state.type === 'owned-dir' && state.pristine && copy !== undefined && sameMeta(state.meta, copy.meta)
  }
  const target = path.resolve(dest.dir, dest.linkTarget)
  // A package link must point at the stable path itself — a link to pnpm's versioned path resolves to the same files but breaks on update.
  if (dest.want === 'package-link') return state.type === 'package-link' && state.target === target
  return state.type === 'mirror-link' && state.resolved === realpathSafe(target)
}

export type SyncStatus = 'in sync' | 'missing' | 'outdated' | 'modified locally'

/**
 * How a skill's materialization compares to what a full sync would leave.
 * User-authored content in its way counts as in sync: a sync leaves that
 * alone too (and creates no mirrors when it blocks the primary dir).
 */
export function syncStatus(skill: PackageSkill, analysis: Analysis, log: Logger): SyncStatus {
  let copy: Copy | undefined
  if (analysis.mode === 'copy') {
    try {
      copy = readCopy(skill, log)
    } catch {
      return 'in sync' // unreadable — a sync skips it too
    }
  }
  const dests = destinations(analysis, skill)
  const mirrored = dests.some((dest) => dest.want === 'mirror-link')
  for (const dest of dests) {
    const state = classifyEntry(dest.entryPath)
    if (isUserContent(state)) {
      if (dest.want === 'files' && mirrored) return 'in sync' // blocks the primary dir: no mirrors
      continue
    }
    if (state.type === 'missing' || state.type === 'dangling-link') return 'missing'
    if (state.type === 'owned-dir' && !state.pristine) return 'modified locally'
    if (!isCurrent(state, dest, copy)) return 'outdated'
  }
  return 'in sync'
}

function writeSkill(entryPath: string, copy: Copy): void {
  fs.mkdirSync(entryPath, { recursive: true })
  writeFileMap(entryPath, copy.files)
  writeSourceJson(entryPath, copy.meta)
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
export function listTampered(active: PackageSkill[], analysis: Analysis): { skill: string; package: string }[] {
  const claimed = new Set<string>()
  const tampered: { skill: string; package: string }[] = []
  for (const skill of active) {
    if (claimed.has(skill.name)) continue
    claimed.add(skill.name)
    for (const dir of analysis.physicalDirs) {
      const state = classifyEntry(path.join(dir, skill.name))
      if (state.type === 'owned-dir' && !state.pristine && stillProvided(active, state.meta.package, skill.name)) {
        tampered.push({ skill: skill.name, package: skill.package })
        break
      }
    }
  }
  return tampered
}

export interface MaterializeContext {
  root: string
  /** Every installed skill — collisions and ownership are decided over all of them. */
  active: PackageSkill[]
  analysis: Analysis
  force: boolean
  confirmOverwrite: (skillName: string, pkgName: string) => Promise<boolean> | boolean
  log: Logger
  /** Write only this package's skills (install-package); the others' are left untouched. */
  only?: string
}

export async function materializeAll(ctx: MaterializeContext): Promise<{ actions: Action[]; tampered: boolean }> {
  const { root, active, analysis, force, log } = ctx
  const actions: Action[] = []
  let anyTamperedKept = false
  const claimed = new Map<string, string>()
  const rel = (p: string) => relDisplay(root, p)

  for (const skill of active) {
    const mine = !ctx.only || skill.package === ctx.only
    // Skill-name collision between two installed packages: first alphabetically wins.
    const claimedBy = claimed.get(skill.name)
    if (claimedBy) {
      if (mine) {
        log.warn(
          `skill name \`${skill.name}\` is provided by both \`${claimedBy}\` and \`${skill.package}\` — ` +
            `keeping \`${claimedBy}\`, skipping \`${skill.package}\``,
        )
        actions.push({ kind: 'skipped-collision', skill: skill.name, package: skill.package })
      }
      continue
    }
    claimed.set(skill.name, skill.package)
    if (!mine) continue

    // Copy mode needs the skill's files up front; symlink mode only where a link cannot be created.
    let copy: Copy | undefined
    const getCopy = () => (copy ??= readCopy(skill, log))
    if (analysis.mode === 'copy') {
      try {
        getCopy()
      } catch (err) {
        log.warn(
          `package \`${skill.package}\`: cannot read the files of skill \`${skill.name}\` (${(err as Error).message}) — skipping`,
        )
        continue
      }
    }

    // ---- Plan: classify every destination before touching anything.
    const dests = destinations(analysis, skill)
    const states = new Map<string, EntryState>()
    for (const dest of dests) states.set(dest.dir, classifyEntry(dest.entryPath))

    // A modified copy that its recorded package no longer provides (uninstalled,
    // excluded, or it dropped the skill) is adopted (source.json removed) — it
    // becomes an ordinary user-authored skill and wins below.
    for (const [dir, state] of states) {
      if (state.type !== 'owned-dir' || state.pristine) continue
      if (!stillProvided(active, state.meta.package, skill.name)) {
        fs.rmSync(path.join(dir, skill.name, SOURCE_JSON), { force: true })
        log.warn(
          `skill \`${skill.name}\` in ${rel(dir)} was modified locally and its package ` +
            `\`${state.meta.package || '(unknown)'}\` no longer provides it — kept as a user-authored skill`,
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
      const owner = tamperedStates[0].meta.package || skill.package
      const consented = force ? await ctx.confirmOverwrite(skill.name, owner) : false
      if (!consented) {
        if (force) {
          log.info(`kept the local changes of skill \`${skill.name}\``)
          actions.push({ kind: 'kept', skill: skill.name, package: skill.package })
        } else {
          log.warn(tamperMessage(skill.name, owner))
          actions.push({ kind: 'tampered', skill: skill.name, package: skill.package })
          anyTamperedKept = true
        }
        continue // leave the whole skill untouched
      }
      forcedOverwrite = true
    }

    // ---- Execute.
    const writeCopy = (entryPath: string) => writeSkill(entryPath, getCopy())
    const makeLink = (linkPath: string, target: string) => {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true })
      try {
        fs.symlinkSync(target, linkPath, 'dir')
      } catch (err) {
        log.warn(`cannot create symlink ${rel(linkPath)} (${(err as Error).message}) — falling back to a copy`)
        writeCopy(linkPath)
      }
    }
    const writtenDirs: string[] = []
    let primaryBlocked = false
    let anyAdded = false
    let anyChanged = false

    for (const dest of dests) {
      if (dest.want === 'mirror-link' && primaryBlocked) continue // no mirrors to user content
      const state = states.get(dest.dir)!
      if (isUserContent(state)) {
        log.warn(
          `skill \`${skill.name}\` in ${rel(dest.dir)} is user-authored — ` +
            `skipping (package \`${skill.package}\`); remove it if you want the package's version`,
        )
        if (dest.want === 'files' && dests.some((d) => d.want === 'mirror-link')) primaryBlocked = true
        continue
      }
      if (isCurrent(state, dest, copy)) {
        // up-to-date
      } else if (state.type === 'missing') {
        if (dest.want === 'files') writeCopy(dest.entryPath)
        else makeLink(dest.entryPath, dest.linkTarget)
        // A mirror created for an existing copy is an update of the skill, not an addition.
        if (dest.want === 'mirror-link') anyChanged = true
        else anyAdded = true
      } else if (
        dest.want === 'files' &&
        state.type === 'owned-dir' &&
        state.pristine &&
        state.meta.hash === getCopy().meta.hash &&
        state.meta.package === skill.package
      ) {
        writeSourceJson(dest.entryPath, getCopy().meta) // same content, new version — refresh metadata only
        anyChanged = true
      } else {
        // A stale, dangling, or misplaced tool-owned entry (a copy where a link belongs, a link where a copy
        // belongs, a link elsewhere), or a force-consented modified copy: replace it.
        rmrf(dest.entryPath)
        if (dest.want === 'files') writeCopy(dest.entryPath)
        else makeLink(dest.entryPath, dest.linkTarget)
        anyChanged = true
      }
      if (dest.want !== 'mirror-link') writtenDirs.push(dest.dir)
    }

    // ---- Report.
    if (writtenDirs.length === 0) {
      actions.push({ kind: 'skipped-user-owned', skill: skill.name, package: skill.package })
      continue
    }
    const where = writtenDirs.map(rel).join(', ')
    if (forcedOverwrite) {
      log.info(
        `overwrote the local changes of skill \`${skill.name}\` (${skill.package}@${skill.version}) — consider ` +
          `removing \`${skill.package}\` — or adding it to \`exclude\` — if you want to keep your changes`,
      )
      actions.push({ kind: 'forced', skill: skill.name, package: skill.package, detail: where })
    } else if (anyAdded) {
      log.info(`+ ${skill.name} (${skill.package}@${skill.version}) → ${where}`)
      actions.push({ kind: 'added', skill: skill.name, package: skill.package, detail: where })
    } else if (anyChanged) {
      log.info(`~ ${skill.name} (${skill.package}@${skill.version}) updated in ${where}`)
      actions.push({ kind: 'updated', skill: skill.name, package: skill.package, detail: where })
    } else {
      actions.push({ kind: 'up-to-date', skill: skill.name, package: skill.package, detail: where })
    }
  }

  return { actions, tampered: anyTamperedKept }
}
