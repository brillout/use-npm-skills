'use strict'

const fs = require('fs')
const path = require('path')
const log = require('./log.js')
const { DOCS_URL } = require('./context.js')

const WIRED_SCRIPT = 'npx use-npm-skills'

// Managed skill entries must never be committed: they are machine-local links into
// node_modules, recreated on any machine by `npx use-npm-skills`.
function gitignoreLinesFor(targetDirsRel) {
  const lines = []
  if (targetDirsRel.some((d) => d === 'skills' || d.endsWith('/skills'))) lines.push('**/skills/npm-*')
  for (const d of targetDirsRel) {
    if (d !== 'skills' && !d.endsWith('/skills')) lines.push(d + '/npm-*')
  }
  return lines
}

function ensureGitignore(rootDir, targetDirsRel) {
  const gitignorePath = path.join(rootDir, '.gitignore')
  let content = null
  try {
    content = fs.readFileSync(gitignorePath, 'utf8')
  } catch {}
  const existingLines = content === null ? [] : content.split(/\r?\n/).map((l) => l.trim())
  const missing = gitignoreLinesFor(targetDirsRel).filter((l) => !existingLines.includes(l))
  if (missing.length === 0) return { changed: false }
  const eol = content !== null && content.includes('\r\n') ? '\r\n' : '\n'
  let updated = content === null ? '' : content
  if (updated !== '' && !updated.endsWith('\n')) updated += eol
  updated += missing.join(eol) + eol
  fs.writeFileSync(gitignorePath, updated)
  return { changed: true, created: content === null, added: missing }
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

module.exports = { ensureGitignore, ensurePostinstallWiring, writeJsonPreservingStyle }
