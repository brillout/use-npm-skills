import path from 'node:path'
import { isDirectory, isFile, readdirSafe } from './fsUtils.js'
import { readPackageLink } from './packageLink.js'
import { DEFAULT_SKILLS_DIR, type Config } from './types.js'

/**
 * Targets = `<root>/skills/` and `<root>/<dir>/skills/` (one level deep,
 * dot-dirs included, node_modules excluded), counting only dirs containing at
 * least one skill entry — an existing-but-empty dir is a Git leftover, not a
 * target. If none qualify: `.agents/skills/` only (created on materialize).
 */
export function discoverTargetDirs(root: string, config: Config): string[] {
  if (config.skillsDirs && config.skillsDirs.length > 0) {
    return config.skillsDirs.map((dir) => path.resolve(root, dir))
  }

  const candidates = [path.join(root, 'skills')]
  for (const entry of readdirSafe(root)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'skills') continue
    const dir = path.join(root, entry)
    if (!isDirectory(dir)) continue
    candidates.push(path.join(dir, 'skills'))
  }

  const qualifying = candidates.filter((dir) => isDirectory(dir) && hasSkillEntries(dir))
  if (qualifying.length > 0) return qualifying
  return [path.join(root, ...DEFAULT_SKILLS_DIR.split('/'))]
}

/**
 * At least one <entry>/SKILL.md (symlinked entries count — SKILL.md is
 * resolved through them), or a package link — dangling included: a skills dir
 * whose packages were all uninstalled still has links to prune.
 */
function hasSkillEntries(dir: string): boolean {
  return readdirSafe(dir).some((entry) => {
    const entryPath = path.join(dir, entry)
    return isFile(path.join(entryPath, 'SKILL.md')) || readPackageLink(entryPath) !== null
  })
}
