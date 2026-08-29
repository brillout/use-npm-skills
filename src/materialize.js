'use strict'

const fs = require('fs')
const path = require('path')

const MANAGED_PREFIX = 'npm-'
// Dropped into copied skill dirs (used when links can't be created) so later runs can tell
// the copy is managed by use-npm-skills — and may therefore refresh or remove it.
const COPY_MARKER = '.use-npm-skills-copy.json'

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

function normalizeLinkTarget(target, linkDir) {
  let t = String(target)
  if (process.platform === 'win32') t = t.replace(/^\\\\\?\\/, '')
  t = path.resolve(linkDir, t).replace(/[\\/]+$/, '')
  if (process.platform === 'win32') t = t.toLowerCase()
  return t
}

function linksTo(linkPath, targetAbs) {
  let current
  try {
    current = fs.readlinkSync(linkPath)
  } catch {
    return false
  }
  const linkDir = path.dirname(linkPath)
  return normalizeLinkTarget(current, linkDir) === normalizeLinkTarget(targetAbs, linkDir)
}

function createLink(linkPath, targetAbs) {
  if (process.env.USE_NPM_SKILLS_TEST_DISABLE_LINKS) {
    // Test hook: exercise the copy fallback on systems where links work.
    const err = new Error('links disabled by USE_NPM_SKILLS_TEST_DISABLE_LINKS')
    err.code = 'EPERM'
    throw err
  }
  if (process.platform === 'win32') {
    // Junctions: directory links that need no privilege on Windows (unlike symlinks). They
    // require absolute targets — the logical node_modules path, never realpath'd. A
    // machine-local absolute target is fine because these links are gitignored.
    fs.symlinkSync(targetAbs, linkPath, 'junction')
  } else {
    fs.symlinkSync(path.relative(path.dirname(linkPath), targetAbs), linkPath)
  }
}

function readCopyMarker(dirPath) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(dirPath, COPY_MARKER), 'utf8'))
    if (marker && typeof marker === 'object' && typeof marker.package === 'string') return marker
  } catch {}
  return null
}

function copyDir(src, dest, depth = 0) {
  if (depth > 32) throw new Error(`${src}: directory tree too deep to copy`)
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    let isDir = entry.isDirectory()
    let isFile = entry.isFile()
    if (entry.isSymbolicLink()) {
      let st
      try {
        st = fs.statSync(from)
      } catch {
        continue // dangling link
      }
      isDir = st.isDirectory()
      isFile = st.isFile()
    }
    if (isDir) copyDir(from, to, depth + 1)
    else if (isFile) fs.copyFileSync(from, to)
  }
}

function materializeCopy(skill, linkPath) {
  try {
    copyDir(skill.skillDirAbs, linkPath)
  } catch (err) {
    // Don't leave a partial copy behind — without its marker it would be treated as
    // user-owned and never touched again.
    try {
      fs.rmSync(linkPath, { recursive: true, force: true })
    } catch {}
    throw err
  }
  const marker = {
    package: skill.name,
    version: skill.version,
    note: 'Copy managed by use-npm-skills (creating links failed on this system). Do not edit — changes get overwritten.',
  }
  fs.writeFileSync(path.join(linkPath, COPY_MARKER), JSON.stringify(marker, null, 2) + '\n')
}

// Returns 'created' | 'copied' | 'up-to-date' | 'skipped'
function ensureEntry(targetDirAbs, targetDirRel, skill, config, warnings) {
  const linkPath = path.join(targetDirAbs, skill.linkName)
  const display = targetDirRel + '/' + skill.linkName
  const st = lstatOrNull(linkPath)
  if (st) {
    if (st.isSymbolicLink()) {
      if (linksTo(linkPath, skill.skillDirAbs)) return 'up-to-date'
      fs.unlinkSync(linkPath) // wrong or outdated target — recreate below
    } else if (st.isDirectory()) {
      const marker = readCopyMarker(linkPath)
      if (!marker) {
        warnings.push(`Not overwriting ${display}: it exists but is not managed by use-npm-skills — remove it if use-npm-skills should take the name over`)
        return 'skipped'
      }
      // A managed copy of the same package version is treated as current. (It is not
      // converted back to a link — on systems where copies were needed once, retrying
      // links on every run would churn.)
      if (marker.package === skill.name && skill.version && marker.version === skill.version) return 'up-to-date'
      fs.rmSync(linkPath, { recursive: true, force: true }) // outdated managed copy — refresh below
    } else {
      warnings.push(`Not overwriting ${display}: an unexpected file is in the way`)
      return 'skipped'
    }
  }
  try {
    createLink(linkPath, skill.skillDirAbs)
    return 'created'
  } catch (err) {
    if (config.neverCopy) {
      warnings.push(`Could not create a link at ${display} (${err.message}) — skipped ("neverCopy" is set)`)
      return 'skipped'
    }
    materializeCopy(skill, linkPath)
    return 'copied'
  }
}

// Remove managed (npm-*) entries whose skill package is no longer installed. Only ever
// removes what use-npm-skills itself creates: symlinks/junctions, and copies carrying the
// copy marker. Anything else is warned about and left alone.
function removeStaleEntries(targetDirAbs, targetDirRel, wantedLinkNames, warnings) {
  const removed = []
  let entries
  try {
    entries = fs.readdirSync(targetDirAbs)
  } catch {
    return removed
  }
  for (const entry of entries.sort()) {
    if (!entry.startsWith(MANAGED_PREFIX) || wantedLinkNames.has(entry)) continue
    const entryPath = path.join(targetDirAbs, entry)
    const display = targetDirRel + '/' + entry
    const st = lstatOrNull(entryPath)
    if (!st) continue
    if (st.isSymbolicLink()) {
      fs.unlinkSync(entryPath)
      removed.push(display)
    } else if (st.isDirectory() && readCopyMarker(entryPath)) {
      fs.rmSync(entryPath, { recursive: true, force: true })
      removed.push(display)
    } else {
      warnings.push(`${display} looks stale but is not managed by use-npm-skills — leaving it alone`)
    }
  }
  return removed
}

function materializeSkills(ctx, targetDirsRel, skills, config) {
  const result = { created: 0, copied: 0, upToDate: 0, skipped: 0, removed: [], warnings: [] }
  const wanted = new Set(skills.map((s) => s.linkName))
  for (const dirRel of targetDirsRel) {
    const dirAbs = path.join(ctx.rootDir, dirRel)
    fs.mkdirSync(dirAbs, { recursive: true })
    result.removed.push(...removeStaleEntries(dirAbs, dirRel, wanted, result.warnings))
    for (const skill of skills) {
      const outcome = ensureEntry(dirAbs, dirRel, skill, config, result.warnings)
      if (outcome === 'created') result.created++
      else if (outcome === 'copied') result.copied++
      else if (outcome === 'up-to-date') result.upToDate++
      else result.skipped++
    }
  }
  return result
}

// Used when zero skill packages are installed: clean up leftovers of previously installed
// ones, but never create directories or touch anything else.
function cleanupStaleEntries(ctx, candidateDirsRel, warnings) {
  const removed = []
  for (const dirRel of candidateDirsRel) {
    const dirAbs = path.join(ctx.rootDir, dirRel)
    if (!lstatOrNull(dirAbs)) continue
    removed.push(...removeStaleEntries(dirAbs, dirRel, new Set(), warnings))
  }
  return removed
}

module.exports = { materializeSkills, cleanupStaleEntries }
