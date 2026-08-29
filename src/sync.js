'use strict'

const path = require('path')
const log = require('./log.js')
const { getContext, UsageError, DOCS_URL, DEFAULT_SKILLS_DIRS, isDirectory } = require('./context.js')
const { findSkillPackages } = require('./scan.js')
const { materializeSkills, cleanupStaleEntries } = require('./materialize.js')
const { ensureGitignore, ensurePostinstallWiring } = require('./repoFiles.js')
const { getPreexistingDirty, tryCommit } = require('./git.js')

function sync({ lifecycle = false } = {}) {
  const ctx = getContext({ forceLifecycle: lifecycle })

  if (ctx.isCI) {
    log.info('CI environment detected (`CI` is set) — nothing to do.')
    return
  }
  if (ctx.isGlobal) {
    log.info('Global install detected — use-npm-skills only operates on projects, nothing to do.')
    return
  }
  if (!ctx.rootDir) {
    const message = `Could not find a project root: no lockfile, node_modules/, or package.json found in ${ctx.startDir} or above.`
    if (ctx.isLifecycle) {
      log.warn(message)
      return
    }
    throw new UsageError(message)
  }
  if (ctx.isPnP) {
    log.info('Yarn PnP detected (.pnp.cjs) — Yarn PnP is not supported, nothing to do.')
    return
  }

  const config = ctx.config
  for (const warning of config.warnings) log.warn(warning)

  if (ctx.isLifecycle && config.postinstall === false) {
    log.info('Skipped: postinstall automation is disabled by package.json#use-npm-skills.postinstall — run `npx use-npm-skills` to sync manually.')
    return
  }

  const candidateDirs = config.skillsDirs !== null ? config.skillsDirs : DEFAULT_SKILLS_DIRS
  if (candidateDirs.length === 0) {
    log.warn('package.json#use-npm-skills.skillsDirs is empty — no skills directories to sync into, nothing to do.')
    return
  }

  const scan = findSkillPackages(ctx)
  for (const warning of scan.warnings) log.warn(warning)
  for (const name of scan.excluded) log.info(`Skipping ${name} (listed in package.json#use-npm-skills.exclude)`)

  // Zero skill packages installed ⇒ zero side effects: no directory creation, no .gitignore
  // edit, no postinstall setup, no commit. Only leftovers of previously installed skill
  // packages get cleaned up.
  if (scan.skills.length === 0) {
    const warnings = []
    const removed = cleanupStaleEntries(ctx, candidateDirs, warnings)
    for (const warning of warnings) log.warn(warning)
    if (removed.length > 0) {
      log.info(`No skill packages found — removed ${removed.length} stale ${removed.length === 1 ? 'entry' : 'entries'}: ${removed.join(', ')}`)
    } else if (!ctx.hasNodeModules) {
      log.info(`No skill packages found: there is no node_modules/ at ${ctx.rootDir} — run your package manager's install first.`)
    } else {
      log.info('No skill packages found — nothing to do.')
      log.info(`(A skill package is an installed dependency that itself depends on use-npm-skills — see ${DOCS_URL})`)
    }
    return
  }

  // Record which files are already dirty BEFORE this run modifies anything.
  const dirtyBefore = getPreexistingDirty(ctx.rootDir, ['.gitignore', 'package.json'])

  // Sync into every existing skills directory; if none exists yet, create all of them.
  const existingDirs = candidateDirs.filter((d) => isDirectory(path.join(ctx.rootDir, d)))
  const targetDirs = existingDirs.length > 0 ? existingDirs : candidateDirs

  const result = materializeSkills(ctx, targetDirs, scan.skills, config)
  for (const warning of result.warnings) log.warn(warning)
  if (result.removed.length > 0) log.info(`Removed stale entries: ${result.removed.join(', ')}`)
  if (result.copied > 0) {
    log.info('Links could not be created on this system — skills were copied instead. Re-run `npx use-npm-skills` after updating skill packages to refresh the copies.')
  }

  const gitignore = ensureGitignore(ctx.rootDir, targetDirs)
  const wiring = ctx.isLifecycle || config.postinstall === false ? { changed: false } : ensurePostinstallWiring(ctx)

  const changedFiles = []
  if (gitignore.changed) changedFiles.push('.gitignore')
  if (wiring.changed) changedFiles.push('package.json')

  if (changedFiles.length > 0) {
    const changed = changedFiles.join(' and ')
    if (config.gitCommit === false) {
      log.info(`Modified ${changed} — left uncommitted (automated commits are disabled by package.json#use-npm-skills.gitCommit).`)
    } else {
      const commit = tryCommit(ctx, changedFiles, dirtyBefore)
      if (commit.committed) {
        log.info(`Committed ${changed} ("Add npm skills", author: use-npm-skills).`)
        log.info('  Undo the commit but keep its changes: git reset HEAD~1')
        log.info('  Disable automated commits: package.json#use-npm-skills: { "gitCommit": false }')
        log.info(`  ${DOCS_URL}#readme`)
      } else {
        log.info(`Modified ${changed} — commit skipped (${commit.skipped}). Review and commit the changes yourself.`)
      }
    }
  }

  log.info(summaryLine(scan.skills, targetDirs, result))
}

function summaryLine(skills, targetDirs, result) {
  const parts = []
  if (result.created) parts.push(`${result.created} created`)
  if (result.copied) parts.push(`${result.copied} copied`)
  if (result.upToDate) parts.push(`${result.upToDate} up-to-date`)
  if (result.removed.length) parts.push(`${result.removed.length} removed`)
  if (result.skipped) parts.push(`${result.skipped} skipped`)
  const dirs = targetDirs.map((d) => d + '/').join(' + ')
  return `Synced ${skills.length} skill${skills.length === 1 ? '' : 's'} into ${dirs} (${parts.join(', ') || 'nothing to do'})`
}

module.exports = { sync }
