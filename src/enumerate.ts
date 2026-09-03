import path from 'node:path'
import { isDirectory, readdirSafe, readJsonSafe } from './fsUtils.js'
import { UsageError, type PackageSkill } from './types.js'

/**
 * A skill package = a top-level node_modules package with a `skills/`
 * directory holding at least one subdirectory — the directory is the only
 * marker (antfu/skills-npm's rule: node_modules/<pkg>/skills/<name>/SKILL.md),
 * so a package built for skills-npm works as-is. Every subdirectory of
 * `skills/` is a skill, taken as-is: nothing is validated (no SKILL.md,
 * frontmatter, or name checks) and nothing is warned about. Root-level scan
 * only — sufficient on pnpm's strict layout because skill packages are direct
 * deps. The result is sorted by package name, then skill name, which makes
 * every later "first one wins" rule deterministic.
 */
export function enumerateSkills(root: string): PackageSkill[] {
  const nodeModules = path.join(root, 'node_modules')
  if (!isDirectory(nodeModules)) {
    throw new UsageError(
      `no node_modules/ found in ${root} — install your dependencies first, then re-run \`npx use-npm-skills\``,
    )
  }

  const packageNames: string[] = []
  for (const entry of readdirSafe(nodeModules)) {
    if (entry.startsWith('.')) continue
    if (entry.startsWith('@')) {
      for (const scoped of readdirSafe(path.join(nodeModules, entry))) {
        if (!scoped.startsWith('.')) packageNames.push(`${entry}/${scoped}`)
      }
    } else {
      packageNames.push(entry)
    }
  }
  packageNames.sort()

  const skills: PackageSkill[] = []
  for (const name of packageNames) {
    const dir = path.join(nodeModules, ...name.split('/'))
    // Every subdirectory of skills/ is a skill; files directly in skills/ are ignored.
    const skillsDir = path.join(dir, 'skills')
    const skillNames = readdirSafe(skillsDir)
      .filter((entry) => isDirectory(path.join(skillsDir, entry)))
      .sort()
    if (skillNames.length === 0) continue // not a skill package
    const pkgJson = readJsonSafe(path.join(dir, 'package.json')) as Record<string, unknown> | null
    if (!pkgJson) continue // not an npm package
    const version = typeof pkgJson.version === 'string' ? pkgJson.version : '0.0.0'
    for (const skillName of skillNames) {
      skills.push({ name: skillName, dir: path.join(skillsDir, skillName), package: name, version })
    }
  }
  return skills
}
