'use strict'

const fs = require('fs')
const path = require('path')
const { isDirectory, isFile } = require('./context.js')

const OWN_NAME = 'use-npm-skills'

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

// The one and only skill-package marker: the package depends on use-npm-skills.
function dependsOnUs(pkg) {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field]
    if (deps && typeof deps === 'object' && Object.prototype.hasOwnProperty.call(deps, OWN_NAME)) return true
  }
  return false
}

// `@scope/name` → `npm-scope-name`; `name` → `npm-name`.
// Naming by package name makes collisions all but impossible (npm's namespace is unique),
// and the `npm-` prefix marks entries as managed by use-npm-skills.
function linkNameFor(pkgName) {
  return (
    'npm-' +
    pkgName
      .replace(/^@/, '')
      .replace(/\//g, '-')
      .replace(/[^A-Za-z0-9._-]/g, '-')
  )
}

// Top-level packages of node_modules (skill packages are direct dependencies of the project,
// so top-level scanning works on npm/yarn hoisted layouts and pnpm's strict layout alike).
function listPackageDirs(nodeModulesDir) {
  const result = []
  let entries
  try {
    entries = fs.readdirSync(nodeModulesDir)
  } catch {
    return result
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    if (entry.startsWith('@')) {
      let scoped
      try {
        scoped = fs.readdirSync(path.join(nodeModulesDir, entry))
      } catch {
        continue
      }
      for (const sub of scoped) {
        if (!sub.startsWith('.')) result.push(entry + '/' + sub)
      }
    } else {
      result.push(entry)
    }
  }
  return result.sort()
}

// One package = one skill: a root SKILL.md, or exactly one skills/<dir>/SKILL.md.
function findSkillSubPath(pkgDir) {
  if (isFile(path.join(pkgDir, 'SKILL.md'))) return { subPath: '.' }
  const skillsDir = path.join(pkgDir, 'skills')
  let entries = []
  if (isDirectory(skillsDir)) {
    try {
      entries = fs.readdirSync(skillsDir).filter((e) => isFile(path.join(skillsDir, e, 'SKILL.md')))
    } catch {}
  }
  if (entries.length === 0) return { error: 'no SKILL.md found (expected a root SKILL.md, or exactly one skills/<dir>/SKILL.md)' }
  if (entries.length > 1) return { error: `it contains multiple skills (${entries.map((e) => 'skills/' + e).join(', ')}) but one package = one skill` }
  return { subPath: 'skills/' + entries[0] }
}

function findSkillPackages(ctx) {
  const skills = []
  const warnings = []
  const excluded = []
  const nodeModulesDir = path.join(ctx.rootDir, 'node_modules')
  const byLinkName = new Map()
  for (const dirName of listPackageDirs(nodeModulesDir)) {
    const pkgDir = path.join(nodeModulesDir, dirName) // on pnpm this is a symlink into the store — reading through it is fine
    const pkg = readJson(path.join(pkgDir, 'package.json'))
    if (!pkg || !dependsOnUs(pkg)) continue
    const name = typeof pkg.name === 'string' && pkg.name !== '' ? pkg.name : dirName
    if (name === OWN_NAME || dirName === OWN_NAME) continue
    if (ctx.config.exclude.includes(name) || ctx.config.exclude.includes(dirName)) {
      excluded.push(name)
      continue
    }
    const found = findSkillSubPath(pkgDir)
    if (found.error) {
      warnings.push(`Skipping installed package ${name}: ${found.error}`)
      continue
    }
    const linkName = linkNameFor(name)
    if (byLinkName.has(linkName)) {
      warnings.push(`Skipping installed package ${name}: its skills directory name ${linkName} collides with ${byLinkName.get(linkName)}`)
      continue
    }
    byLinkName.set(linkName, name)
    skills.push({
      name,
      linkName,
      skillDirAbs: found.subPath === '.' ? pkgDir : path.join(pkgDir, found.subPath),
      version: typeof pkg.version === 'string' ? pkg.version : null,
    })
  }
  return { skills, warnings, excluded }
}

module.exports = { findSkillPackages, linkNameFor }
