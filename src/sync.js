'use strict'

const path = require('path')
const log = require('./log.js')
const { getContext, UsageError, DOCS_URL, DEFAULT_SKILLS_DIRS, isDirectory } = require('./context.js')
const { findSkillPackages } = require('./scan.js')
const { materializeSkills, cleanupStaleEntries } = require('./materialize.js')
const { removeLegacyGitignoreLines, ensurePostinstallWiring } = require('./repoFiles.js')
const { getStatus, statusDirty, hasTrackedContent, isIgnored, tryCommit } = require('./git.js')

function sync({ lifecycle = false } = {}) {
  const ctx = getContext({ forceLifecycle: lifecycle })

  if (ctx.isCI) {
    log.info('CI environment detected (`CI` is set) — nothing to do. (Committed skills are already part of the checkout.)')
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

  // Zero skill packages installed ⇒ zero side effects on pristine projects: no directory
  // creation, no postinstall setup. Only leftovers of previously installed skill packages
  // get cleaned up (and their removal committed, like any other sync change).
  if (scan.skills.length === 0) {
    if (!ctx.hasNodeModules) {
      // No node_modules at all means "not installed yet", not "packages uninstalled" — e.g.
      // a fresh clone with committed skills. Removing anything here would destroy them.
      log.info(`No skill packages found: there is no node_modules/ at ${ctx.rootDir} — run your package manager's install first. Committed skills were left untouched.`)
      return
    }
    const existingDirs = candidateDirs.filter((d) => isDirectory(path.join(ctx.rootDir, d)))
    const status = existingDirs.length > 0 ? getStatus(ctx.rootDir, existingDirs) : null
    const guards = { hasTrackedModifications: (p) => statusDirty(status, p, true) }
    const warnings = []
    const removed = cleanupStaleEntries(ctx, existingDirs, guards, warnings)
    for (const warning of warnings) log.warn(warning)
    if (removed.length > 0) {
      log.info(`No skill packages found — removed ${removed.length} stale ${removed.length === 1 ? 'entry' : 'entries'}: ${removed.join(', ')}`)
      const commitPaths = status === null ? [] : removed.filter((p) => hasTrackedContent(ctx.rootDir, p))
      commitChanges(ctx, config, commitPaths, 'Update npm skills', [])
    } else {
      log.info('No skill packages found — nothing to do.')
      log.info(`(A skill package is an installed dependency that itself depends on use-npm-skills — see ${DOCS_URL})`)
    }
    return
  }

  // Sync into every existing skills directory; if none exists yet, create all of them.
  const existingDirs = candidateDirs.filter((d) => isDirectory(path.join(ctx.rootDir, d)))
  const targetDirs = existingDirs.length > 0 ? existingDirs : candidateDirs

  // Uncommitted state BEFORE this run modifies anything — used to keep user edits out of
  // automated commits, and to never overwrite hand-edited committed skill content.
  const status = getStatus(ctx.rootDir, [...targetDirs, 'package.json', '.gitignore'])
  const dirtyAny = (p) => statusDirty(status, p, false)
  const dirtyTracked = (p) => statusDirty(status, p, true)
  const preDirty = { gitignore: dirtyAny('.gitignore'), packageJson: dirtyAny('package.json') }

  const result = materializeSkills(ctx, targetDirs, scan.skills, { hasTrackedModifications: dirtyTracked })
  for (const warning of result.warnings) log.warn(warning)
  if (result.removed.length > 0) log.info(`Removed stale entries: ${result.removed.join(', ')}`)

  const gitignore = removeLegacyGitignoreLines(ctx.rootDir, candidateDirs)
  const wiring = ctx.isLifecycle || config.postinstall === false ? { changed: false } : ensurePostinstallWiring(ctx)

  // What to commit: everything this run changed — plus managed dirs that are current but
  // were never committed (e.g. an earlier run couldn't commit) — minus paths the user had
  // already modified before this run, which are theirs to review and commit.
  const commitPaths = [...result.created, ...result.updated]
  if (status !== null) {
    for (const p of result.removed) {
      if (hasTrackedContent(ctx.rootDir, p)) commitPaths.push(p)
    }
    if (config.gitCommit !== false) {
      for (const p of result.upToDate) {
        if (dirtyAny(p) && !dirtyTracked(p) && !hasTrackedContent(ctx.rootDir, p)) commitPaths.push(p)
      }
    }
  }
  if (gitignore.changed) {
    if (!preDirty.gitignore) commitPaths.push('.gitignore')
    else log.info('.gitignore already had uncommitted changes before this run — its new change is left uncommitted too, for you to review.')
  }
  if (wiring.changed) {
    if (!preDirty.packageJson) commitPaths.push('package.json')
    else log.info('package.json already had uncommitted changes before this run — its new change is left uncommitted too, for you to review.')
  }

  // A path covered by a (user-authored) .gitignore rule cannot be committed — warn instead
  // of force-adding against the user's ignore rules.
  let commitable = commitPaths
  if (status !== null) {
    commitable = commitPaths.filter((p) => {
      if (isIgnored(ctx.rootDir, p)) {
        log.warn(`${p} is ignored by .gitignore — committed skills need it tracked; remove the ignore rule and re-run.`)
        return false
      }
      return true
    })
  }

  // The commit body names which packages the committed content comes from — the commit
  // metadata alone would only show the bot identity.
  const changedEntryNames = new Set([...result.created, ...result.updated].map((p) => p.split('/').pop()))
  const provenance = scan.skills.filter((s) => changedEntryNames.has(s.linkName)).map((s) => `${s.name}@${s.version}`)

  const title = result.created.length > 0 ? 'Add npm skills' : 'Update npm skills'
  commitChanges(ctx, config, commitable, title, provenance.length > 0 ? [`Skill packages: ${provenance.join(', ')}`] : [])

  log.info(summaryLine(scan.skills, targetDirs, result))
}

function commitChanges(ctx, config, commitPaths, title, extraBodyLines) {
  if (commitPaths.length === 0) return
  const listed = commitPaths.join(', ')
  if (config.gitCommit === false) {
    log.info(`Left uncommitted (automated commits are disabled by package.json#use-npm-skills.gitCommit): ${listed}`)
    return
  }
  const commit = tryCommit(ctx, commitPaths, title, extraBodyLines)
  if (commit.committed) {
    log.info(`Committed ${listed} ("${title}", author: use-npm-skills).`)
    log.info('  Undo the commit but keep its changes: git reset HEAD~1')
    log.info('  Disable automated commits: package.json#use-npm-skills: { "gitCommit": false }')
    log.info(`  ${DOCS_URL}#readme`)
  } else {
    log.info(`Left uncommitted (${commit.skipped}): ${listed} — review and commit the changes yourself.`)
  }
}

function summaryLine(skills, targetDirs, result) {
  const parts = []
  if (result.created.length) parts.push(`${result.created.length} created`)
  if (result.updated.length) parts.push(`${result.updated.length} updated`)
  if (result.upToDate.length) parts.push(`${result.upToDate.length} up-to-date`)
  if (result.removed.length) parts.push(`${result.removed.length} removed`)
  if (result.skipped) parts.push(`${result.skipped} skipped`)
  const dirs = targetDirs.map((d) => d + '/').join(' + ')
  return `Synced ${skills.length} skill${skills.length === 1 ? '' : 's'} into ${dirs} (${parts.join(', ') || 'nothing to do'})`
}

module.exports = { sync }
