'use strict'

const fs = require('fs')
const path = require('path')
const log = require('./log.js')
const { DOCS_URL } = require('./context.js')

const WIRED_SCRIPT = 'npx use-npm-skills'

// use-npm-skills v0.1 materialized skills as gitignored links and added these rules. Skills
// are committed to the repo now, so leftover rules would silently keep them out of git —
// remove them on sight.
function removeLegacyGitignoreLines(rootDir, skillsDirsRel) {
  const gitignorePath = path.join(rootDir, '.gitignore')
  let content
  try {
    content = fs.readFileSync(gitignorePath, 'utf8')
  } catch {
    return { changed: false }
  }
  const legacy = new Set(['**/skills/npm-*'])
  for (const dir of skillsDirsRel) legacy.add(dir + '/npm-*')
  const lines = content.split(/\r?\n/)
  const kept = lines.filter((line) => !legacy.has(line.trim()))
  if (kept.length === lines.length) return { changed: false }
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const remaining = kept.join(eol)
  if (remaining.trim() === '') {
    fs.unlinkSync(gitignorePath)
    log.info('Deleted .gitignore — it only contained the legacy use-npm-skills rule (skills are committed to the repo now).')
    return { changed: true, deleted: true }
  }
  fs.writeFileSync(gitignorePath, remaining)
  log.info('Removed the legacy use-npm-skills rule from .gitignore (skills are committed to the repo now).')
  return { changed: true }
}

// Rewrite a JSON file while preserving its indentation, line endings, and trailing newline.
function writeJsonPreservingStyle(filePath, raw, value) {
  const indent = (raw.match(/\n([ \t]+)"/) || [null, '  '])[1]
  let out = JSON.stringify(value, null, indent)
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n')
  if (raw === '' || raw.endsWith('\n')) out += raw.includes('\r\n') ? '\r\n' : '\n'
  fs.writeFileSync(filePath, out)
}

function statMtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs
  } catch {
    return null
  }
}

// The stamp is written by use-npm-skills' own postinstall script. Absent or older than the
// lockfile ⇔ the last install demonstrably did not run dependency scripts (e.g. pnpm 10 and
// Bun block them by default) — so a root postinstall hook is needed to keep skills in sync.
function isStampStale(ctx) {
  const stampMtime = statMtimeMs(path.join(ctx.rootDir, 'node_modules', '.use-npm-skills', 'stamp'))
  if (stampMtime === null) return true
  let stale = false
  for (const lockfilePath of ctx.lockfilePaths) {
    const lockMtime = statMtimeMs(lockfilePath)
    if (lockMtime !== null && stampMtime < lockMtime) stale = true
  }
  return stale
}

// Add `"postinstall": "npx use-npm-skills"` to the user's package.json — explicit runs only,
// lifecycle runs never touch package.json.
function ensurePostinstallWiring(ctx) {
  if (!isStampStale(ctx)) return { changed: false }
  const pkgPath = path.join(ctx.rootDir, 'package.json')
  let raw
  try {
    raw = fs.readFileSync(pkgPath, 'utf8')
  } catch {
    log.warn(`Could not read ${pkgPath} — skipping postinstall setup`)
    return { changed: false }
  }
  let pkg
  try {
    pkg = JSON.parse(raw)
  } catch (err) {
    log.warn(`Could not parse package.json (${err.message}) — skipping postinstall setup`)
    return { changed: false }
  }
  const current = pkg.scripts && pkg.scripts.postinstall
  if (typeof current === 'string' && current.includes('use-npm-skills')) return { changed: false }
  if (current !== undefined && typeof current !== 'string') {
    log.warn('package.json#scripts.postinstall is not a string — skipping postinstall setup')
    return { changed: false }
  }
  const merged = current ? current + ' && ' + WIRED_SCRIPT : WIRED_SCRIPT
  if (!pkg.scripts || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts)) pkg.scripts = {}
  pkg.scripts.postinstall = merged
  writeJsonPreservingStyle(pkgPath, raw, pkg)
  log.info(`Set package.json#scripts.postinstall to "${merged}" so that future installs keep skills in sync.`)
  log.info(`  Opt out: package.json#use-npm-skills: { "postinstall": false } — ${DOCS_URL}#configuration`)
  if (current) {
    log.warn(`package.json already had a "postinstall" script — appended "&& ${WIRED_SCRIPT}". Double-check the merged script: "${merged}"`)
  }
  return { changed: true, script: merged }
}

module.exports = { removeLegacyGitignoreLines, ensurePostinstallWiring, writeJsonPreservingStyle }
