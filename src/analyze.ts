import path from 'node:path'
import { isFile, lstatType, readdirSafe, realpathSafe, relDisplay } from './fsUtils.js'
import { detectGitSymlinkSupport } from './gitSymlinks.js'
import { DEFAULT_SKILLS_DIR, type Analysis, type MirrorStyle } from './types.js'

interface SkillInstance {
  kind: 'real' | 'link'
  /** For links: the physical target dir the link points into (if any). */
  linkPrimary?: string
}

/**
 * Analysis always wins over the default pattern. Precedence: dir-level
 * symlinks (collapsed into one physical dir) → per-skill symlinks (majority
 * vote) → duplicated skills without symlinks (copy vote) → tie ⇒ default.
 *
 * Default: real files in `.agents/skills/` (or the first target
 * alphabetically), per-skill relative symlinks elsewhere — except on Windows
 * without Git symlink support, where copies are the default.
 */
export function analyzeStructure(
  root: string,
  targetDirs: string[],
  platform: NodeJS.Platform,
  gitSymlinks: (root: string) => boolean = detectGitSymlinkSupport,
): Analysis {
  // Collapse dir-level symlinks: group targets by physical identity.
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
  physicalDirs.sort((a, b) => (relDisplay(root, a) < relDisplay(root, b) ? -1 : 1))

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

  // Consulted only when the vote ties (the default applies): on Windows,
  // symlinks are the default only where Git symlink support is available.
  const defaultStyle = (): MirrorStyle => (platform === 'win32' && !gitSymlinks(root) ? 'copy' : 'symlink')
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

  return { physicalDirs, style, primaryDir }
}
