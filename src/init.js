'use strict'

const fs = require('fs')
const path = require('path')
const log = require('./log.js')
const { DOCS_URL, UsageError, isFile, isDirectory } = require('./context.js')
const { writeJsonPreservingStyle } = require('./repoFiles.js')

const OWN_VERSION = require('../package.json').version

function toPackageName(dirName) {
  const name = dirName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
  return name || 'my-skill'
}

// Skill names (agentskills.io convention): lowercase letters, digits, hyphens; max 64 chars.
function toSkillName(pkgName) {
  const name = pkgName
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return name || 'my-skill'
}

function skillMdTemplate(skillName) {
  return `---
name: ${skillName}
description: TODO — one or two sentences saying what this skill does and when an agent should use it. Agents read this to decide when to load the skill.
---

# ${skillName}

TODO — write the skill instructions here. Agents read this file when they use the skill.

SKILL.md convention: https://agentskills.io
`
}

function hasSkillFile(dir) {
  if (isFile(path.join(dir, 'SKILL.md'))) return true
  const skillsDir = path.join(dir, 'skills')
  if (!isDirectory(skillsDir)) return false
  try {
    return fs.readdirSync(skillsDir).some((e) => isFile(path.join(skillsDir, e, 'SKILL.md')))
  } catch {
    return false
  }
}

// Scaffold a skill package in `dir`: package.json (name, files, the use-npm-skills
// dependency — the dependency is what marks the package as a skill package) + a SKILL.md
// template. Existing files are preserved and only minimally extended.
function init(dir) {
  const pkgPath = path.join(dir, 'package.json')
  const actions = []

  let raw = null
  try {
    raw = fs.readFileSync(pkgPath, 'utf8')
  } catch {}

  let pkg
  if (raw === null) {
    pkg = {
      name: toPackageName(path.basename(dir)),
      version: '0.1.0',
      description: 'TODO',
      files: ['SKILL.md'],
      dependencies: {},
    }
    actions.push('Created package.json')
  } else {
    try {
      pkg = JSON.parse(raw)
    } catch (err) {
      throw new UsageError(`Could not parse ${pkgPath}: ${err.message}`)
    }
  }

  if (!pkg.dependencies || typeof pkg.dependencies !== 'object' || Array.isArray(pkg.dependencies)) pkg.dependencies = {}
  if (!pkg.dependencies['use-npm-skills']) {
    pkg.dependencies['use-npm-skills'] = '^' + OWN_VERSION
    if (raw !== null) actions.push('Added the use-npm-skills dependency to package.json (this dependency is what marks the package as a skill package)')
  }

  const skillExists = hasSkillFile(dir)
  if (!skillExists && Array.isArray(pkg.files) && !pkg.files.includes('SKILL.md')) {
    pkg.files.push('SKILL.md')
    if (raw !== null) actions.push('Added SKILL.md to package.json#files')
  }

  writeJsonPreservingStyle(pkgPath, raw === null ? '' : raw, pkg)

  if (!skillExists) {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMdTemplate(toSkillName(String(pkg.name || 'my-skill'))))
    actions.push('Created SKILL.md')
  }

  if (actions.length === 0) {
    log.info('Nothing to do — this directory is already set up as a skill package.')
  } else {
    for (const action of actions) log.info(action)
  }
  console.log(`
Next steps:
  1. Fill in SKILL.md (the name/description frontmatter + the instructions)
  2. Publish: npm publish
  3. Use it in a project: npm install ${pkg.name} && npx use-npm-skills

Docs: ${DOCS_URL}`)
}

module.exports = { init }
