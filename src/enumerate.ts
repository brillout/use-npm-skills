import fs from 'node:fs'
import path from 'node:path'
import { isValidSkillName, parseFrontmatterName } from './frontmatter.js'
import { isDirectory, isFile, readdirSafe, readJsonSafe } from './fsUtils.js'
import type { Logger } from './logger.js'
import { KEYWORD, UsageError, type SkillPackage } from './types.js'

/**
 * A skill package = a top-level node_modules package with "use-npm-skills" in
 * its package.json keywords. Root-level scan only — sufficient on pnpm's
 * strict layout because skill packages are direct deps.
 */
export function enumerateSkillPackages(root: string, log: Logger): SkillPackage[] {
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

  const packages: SkillPackage[] = []
  for (const name of packageNames) {
    const dir = path.join(nodeModules, ...name.split('/'))
    const pkgJson = readJsonSafe(path.join(dir, 'package.json')) as Record<string, unknown> | null
    if (!pkgJson) continue
    const keywords = pkgJson.keywords
    if (!Array.isArray(keywords) || !keywords.includes(KEYWORD)) continue

    const skillMdPath = path.join(dir, 'skill', 'SKILL.md')
    if (!isFile(skillMdPath)) {
      log.warn(
        isFile(path.join(dir, 'SKILL.md'))
          ? `package \`${name}\` ships a root SKILL.md, which is not supported — the skill ` +
              `(its SKILL.md and any other files) must live in a skill/ directory — skipping`
          : `package \`${name}\` is marked with the \`${KEYWORD}\` keyword but ships no skill ` +
              `(expected a skill/ directory containing a SKILL.md) — skipping`,
      )
      continue
    }

    let skillMd: string
    try {
      skillMd = fs.readFileSync(skillMdPath, 'utf8')
    } catch {
      log.warn(`package \`${name}\`: cannot read skill/SKILL.md — skipping`)
      continue
    }
    const skillName = parseFrontmatterName(skillMd)
    if (!skillName) {
      log.warn(`package \`${name}\`: no \`name\` in the frontmatter of skill/SKILL.md — skipping`)
      continue
    }
    if (!isValidSkillName(skillName)) {
      log.warn(
        `package \`${name}\`: invalid skill name ${JSON.stringify(skillName)} ` +
          `(expected lowercase letters, digits, and hyphens) — skipping`,
      )
      continue
    }

    const version = typeof pkgJson.version === 'string' ? pkgJson.version : '0.0.0'
    packages.push({ name, version, dir, skillName })
  }
  return packages
}
