import fs from 'node:fs'
import path from 'node:path'
import { isValidSkillName, parseFrontmatterName } from './frontmatter.js'
import { isDirectory, isFile, readdirSafe, readJsonSafe } from './fsUtils.js'
import type { Logger } from './logger.js'
import { KEYWORD, UsageError, type PackageSkill } from './types.js'

/**
 * A skill package = a top-level node_modules package with "use-npm-skills" in
 * its package.json keywords. Root-level scan only — sufficient on pnpm's
 * strict layout because skill packages are direct deps. A package ships any
 * number of skills as `skills/<name>/` (one subdirectory per skill — the
 * antfu/skills-npm layout). The result is sorted by package name, then skill
 * name, which makes every later "first one wins" rule deterministic.
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
    const pkgJson = readJsonSafe(path.join(dir, 'package.json')) as Record<string, unknown> | null
    if (!pkgJson) continue
    const keywords = pkgJson.keywords
    if (!Array.isArray(keywords) || !keywords.includes(KEYWORD)) continue
    const version = typeof pkgJson.version === 'string' ? pkgJson.version : '0.0.0'

    // Every subdirectory of skills/ is a skill; files directly in skills/ are ignored.
    const skillsDir = path.join(dir, 'skills')
    const skillNames = readdirSafe(skillsDir)
      .filter((entry) => isDirectory(path.join(skillsDir, entry)))
      .sort()
    if (skillNames.length === 0) {
      log.warn(
        `package \`${name}\` is marked with the \`${KEYWORD}\` keyword but ships no skills ` +
          `(expected a skills/ directory with one subdirectory per skill, each containing a SKILL.md) — skipping`,
      )
      continue
    }
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
