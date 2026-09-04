import path from 'node:path'
import { isFile, lstatType, readdirSafe, realpathSafe, relDisplay } from './fsUtils.js'
import { detectGitSymlinkSupport } from './gitSymlinks.js'
import type { Logger } from './logger.js'
import { DEFAULT_MODE, DEFAULT_SKILLS_DIR, type Analysis, type Config, type MirrorStyle } from './types.js'

export interface AnalyzeOptions {
  root: string
  targetDirs: string[]
  config: Config
  platform: NodeJS.Platform
  /** Is Git symlink support available at the root? Consulted on Windows only. */
  gitSymlinks?: (root: string) => boolean
  log: Logger
}

/**
 * Decides the layout skills are materialized in.
 *
 * Dir-level symlinks among the targets collapse into one physical dir. The
 * mode comes from the config (default: symlink) — except on Windows without
 * Git symlink support, where symlink mode falls back to copy mode. Symlink
 * mode needs nothing else: every physical dir gets a package link per skill.
 *
 * Copy mode mirrors skills between the physical dirs, and the existing
 * structure always wins over the default pattern. Precedence: per-skill
 * symlinks (majority vote) → duplicated skills without symlinks (copy vote) →
 * tie ⇒ default: real files in `.agents/skills/` (or the first target
 * alphabetically), per-skill relative symlinks elsewhere — except on Windows
 * without Git symlink support, where copies are the default.
 */
export function analyzeStructure(options: AnalyzeOptions): Analysis {
  const { root, config, platform, gitSymlinks = detectGitSymlinkSupport, log } = options
  const physicalDirs = collapseDirLevelSymlinks(root, options.targetDirs)

  // Symlinks are assumed to work everywhere but on Windows, where they need Git symlink support.
  let symlinksAvailable: boolean | undefined
  const canSymlink = () => (symlinksAvailable ??= platform !== 'win32' || gitSymlinks(root))

  const mode = config.mode ?? DEFAULT_MODE
  if (mode === 'symlink') {
    if (canSymlink()) return { mode, physicalDirs }
    log.info('Git symlink support is unavailable on this machine — skills are copied instead of symlinked')
  }
  return { mode: 'copy', physicalDirs, ...mirrorPattern(root, physicalDirs, canSymlink) }
}

/** Group the targets by the physical dir they resolve to; each group is one physical dir (its non-symlink member). */
function collapseDirLevelSymlinks(root: string, targetDirs: string[]): string[] {
  const groups = new Map<string, { dir: string; isLink: boolean }[]>()
  for (const dir of targetDirs) {
    const isLink = lstatType(dir) === 'symlink'
    const real = realpathSafe(dir) ?? dir
    const group = groups.get(real)
    if (group) group.push({ dir, isLink })
    else groups.set(real, [{ dir, isLink }])
  }
  const physicalDirs: string[] = []
  for (const [real, members] of groups) {
    const nonLink = members.find((m) => !m.isLink)
    physicalDirs.push(nonLink ? nonLink.dir : real)
  }
  return physicalDirs.sort((a, b) => (relDisplay(root, a) < relDisplay(root, b) ? -1 : 1))
}

interface SkillInstance {
  kind: 'real' | 'link'
  /** For links: the physical target dir the link points into (if any). */
  linkPrimary?: string
}

/** Copy mode: the mirror style and primary dir, from the existing structure — the default pattern only on a tie. */
function mirrorPattern(
  root: string,
  physicalDirs: string[],
  canSymlink: () => boolean,
): { style: MirrorStyle; primaryDir: string } {
  // Collect existing skill entries per physical dir.
  const physicalReal = new Map(physicalDirs.map((dir) => [dir, realpathSafe(dir) ?? dir]))
  const entries = new Map<string, Map<string, SkillInstance>>()
  for (const dir of physicalDirs) {
    const dirEntries = new Map<string, SkillInstance>()
    for (const name of readdirSafe(dir)) {
      const entryPath = path.join(dir, name)
      const type = lstatType(entryPath)
      if (type === 'symlink') {
        const resolved = realpathSafe(entryPath)
        if (!resolved || !isFile(path.join(resolved, 'SKILL.md'))) continue
        const parent = path.dirname(resolved)
        const owner = physicalDirs.find((p) => physicalReal.get(p) === parent)
        dirEntries.set(name, { kind: 'link', ...(owner ? { linkPrimary: owner } : {}) })
      } else if (type === 'dir') {
        if (!isFile(path.join(entryPath, 'SKILL.md'))) continue
        dirEntries.set(name, { kind: 'real' })
      }
    }
    entries.set(dir, dirEntries)
  }

  // Vote per skill name present in ≥2 physical dirs.
  const styleVotes = { symlink: 0, copy: 0 }
  const primaryVotes = new Map<string, number>()
  const allNames = new Set<string>()
  for (const dirEntries of entries.values()) for (const name of dirEntries.keys()) allNames.add(name)
  for (const name of allNames) {
    const instances = physicalDirs
      .map((dir) => entries.get(dir)!.get(name))
      .filter((instance): instance is SkillInstance => instance !== undefined)
    if (instances.length < 2) continue
    const links = instances.filter((instance) => instance.kind === 'link' && instance.linkPrimary)
    if (links.length > 0) {
      styleVotes.symlink++
      for (const link of links) primaryVotes.set(link.linkPrimary!, (primaryVotes.get(link.linkPrimary!) ?? 0) + 1)
    } else if (instances.filter((instance) => instance.kind === 'real').length >= 2) {
      styleVotes.copy++
    }
  }

  // The default applies only when the vote ties.
  const defaultStyle = (): MirrorStyle => (canSymlink() ? 'symlink' : 'copy')
  const style: MirrorStyle =
    styleVotes.symlink > styleVotes.copy ? 'symlink' : styleVotes.copy > styleVotes.symlink ? 'copy' : defaultStyle()

  const defaultDir = path.join(root, ...DEFAULT_SKILLS_DIR.split('/'))
  const defaultPrimary = physicalDirs.includes(defaultDir) ? defaultDir : physicalDirs[0]
  let primaryDir = defaultPrimary
  if (primaryVotes.size > 0) {
    const max = Math.max(...primaryVotes.values())
    const winners = physicalDirs.filter((dir) => primaryVotes.get(dir) === max)
    primaryDir = winners.includes(defaultPrimary) ? defaultPrimary : winners[0]
  }

  return { style, primaryDir }
}
