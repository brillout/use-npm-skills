import fs from 'node:fs'
import path from 'node:path'
import { isValidSkillName, parseFrontmatterName } from './frontmatter.js'
import { isDirectory, isFile, readdirSafe, readJsonSafe } from './fsUtils.js'
import type { Logger } from './logger.js'
import { UsageError, type PackageSkill } from './types.js'

/**
 * A skill package = a top-level node_modules package with a `skills/`
 * directory holding at least one subdirectory — the directory is the only
 * marker (antfu/skills-npm's rule: node_modules/<pkg>/skills/<name>/SKILL.md), so a
 * package built for skills-npm works as-is. Root-level scan only —
 * sufficient on pnpm's strict layout because skill packages are direct deps.
 * Each subdirectory of `skills/` is one skill; the result is sorted by
 * package name, then skill name, which makes every later "first one wins"
 * rule deterministic.
 */
export function enumerateSkills(root: string, log: Logger): PackageSkill[] {
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
      const skillDir = path.join(skillsDir, skillName)
      const problem = skillProblem(skillDir, skillName)
      if (problem) {
        log.warn(`package \`${name}\`: ${problem} — skipping that skill`)
        continue
      }
      skills.push({ name: skillName, dir: skillDir, package: name, version })
    }
  }
  return skills
}

/** What makes `skills/<skillName>/` unusable as a skill — null if it is usable. */
function skillProblem(skillDir: string, skillName: string): string | null {
  const where = `skills/${skillName}/`
  if (!isValidSkillName(skillName)) {
    return `invalid skill name ${JSON.stringify(skillName)} (${where}) — ` +
      `expected lowercase letters, digits, and hyphens`
  }
  const skillMdPath = path.join(skillDir, 'SKILL.md')
  if (!isFile(skillMdPath)) return `${where} has no SKILL.md`
  let skillMd: string
  try {
    skillMd = fs.readFileSync(skillMdPath, 'utf8')
  } catch {
    return `cannot read ${where}SKILL.md`
  }
  const frontmatterName = parseFrontmatterName(skillMd)
  if (!frontmatterName) return `no \`name\` in the frontmatter of ${where}SKILL.md`
  if (frontmatterName !== skillName) {
    return (
      `the frontmatter \`name\` of ${where}SKILL.md is ${JSON.stringify(frontmatterName)} but the directory is named ` +
      `${JSON.stringify(skillName)} — they must match`
    )
  }
  return null
}
