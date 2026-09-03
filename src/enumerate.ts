import path from 'node:path'
import { isDirectory, readdirEntriesSafe, readdirSafe, readJsonSafe, toPosix } from './fsUtils.js'
import { UsageError, type PackageSkill } from './types.js'

/**
 * A skill package = a top-level package of any `node_modules/` in the repo
 * with a `skills/` directory holding at least one subdirectory — the
 * directory is the only marker (antfu/skills-npm's rule), so a package built
 * for skills-npm works as-is. Every `node_modules/` under the root (the Git
 * repo root) is crawled — the root's own first, then the others by path —
 * because a workspace package's deps are installed in its own `node_modules/`
 * (pnpm never hoists them; antfu/skills-npm#34). A `node_modules/` nested inside another is a
 * dependency's own tree and is not crawled. The same package in several of
 * them counts once: the first copy that ships skills wins. Every subdirectory
 * of `skills/` is a skill, taken as-is: nothing is validated and nothing is
 * warned about. The result is sorted by node_modules dir, package name, then
 * skill name, which makes every later "first one wins" rule deterministic.
 */
export function enumerateSkills(root: string): PackageSkill[] {
  const nodeModulesDirs = findNodeModulesDirs(root)
  if (nodeModulesDirs.length === 0) {
    throw new UsageError(
      `no node_modules/ found in ${root} or below — install your dependencies first, then re-run \`npx use-npm-skills\``,
    )
  }

  const skills: PackageSkill[] = []
  const seen = new Set<string>()
  for (const nodeModules of nodeModulesDirs) {
    for (const name of listPackages(nodeModules)) {
      if (seen.has(name)) continue
      const dir = path.join(nodeModules, ...name.split('/'))
      // Every subdirectory of skills/ is a skill; files directly in skills/ are ignored.
      const skillsDir = path.join(dir, 'skills')
      const skillNames = readdirSafe(skillsDir)
        .filter((entry) => isDirectory(path.join(skillsDir, entry)))
        .sort()
      if (skillNames.length === 0) continue // not a skill package
      const pkgJson = readJsonSafe(path.join(dir, 'package.json')) as Record<string, unknown> | null
      if (!pkgJson) continue // not an npm package
      seen.add(name)
      const version = typeof pkgJson.version === 'string' ? pkgJson.version : '0.0.0'
      for (const skillName of skillNames) {
        skills.push({ name: skillName, dir: path.join(skillsDir, skillName), package: name, version })
      }
    }
  }
  return skills
}

/**
 * Every `node_modules/` in the tree below `root` — the root's own first, then
 * the others by path — without descending into one (or into `.git/`), and
 * without following symlinks.
 */
function findNodeModulesDirs(root: string): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirEntriesSafe(dir)) {
      if (!entry.isDirectory() || entry.name === '.git') continue
      const abs = path.join(dir, entry.name)
      if (entry.name === 'node_modules') found.push(abs)
      else walk(abs)
    }
  }
  walk(root)
  const rootNodeModules = path.join(root, 'node_modules')
  const key = (dir: string) => (dir === rootNodeModules ? '' : toPosix(path.relative(root, dir)))
  return found.sort((a, b) => (key(a) < key(b) ? -1 : 1))
}

/** The top-level packages of a `node_modules/` dir (scoped ones as `@scope/name`), sorted by name. */
function listPackages(nodeModules: string): string[] {
  const names: string[] = []
  for (const entry of readdirSafe(nodeModules)) {
    if (entry.startsWith('.')) continue
    if (entry.startsWith('@')) {
      for (const scoped of readdirSafe(path.join(nodeModules, entry))) {
        if (!scoped.startsWith('.')) names.push(`${entry}/${scoped}`)
      }
    } else {
      names.push(entry)
    }
  }
  return names.sort()
}
