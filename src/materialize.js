'use strict'

const fs = require('fs')
const path = require('path')

const MANAGED_PREFIX = 'npm-'
// Written into every materialized skill dir: marks the dir as managed by use-npm-skills
// (safe to refresh/remove) and records which package version it holds.
const MARKER = '.use-npm-skills.json'
// v0.1 wrote this marker name (copies were only a fallback back then). Still recognized so
// upgrades refresh cleanly.
const LEGACY_MARKERS = ['.use-npm-skills-copy.json']

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

function readMarker(dirPath) {
  for (const name of [MARKER, ...LEGACY_MARKERS]) {
    try {
      const marker = JSON.parse(fs.readFileSync(path.join(dirPath, name), 'utf8'))
      if (marker && typeof marker === 'object' && typeof marker.package === 'string') return marker
    } catch {}
  }
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

function writeSkillDir(skill, destPath) {
  try {
    copyDir(skill.skillDirAbs, destPath)
  } catch (err) {
    // Don't leave a partial copy behind — without its marker it would be treated as
    // user-owned and never touched again.
    try {
      fs.rmSync(destPath, { recursive: true, force: true })
    } catch {}
    throw err
  }
  const marker = {
    package: skill.name,
    version: skill.version,
    note: 'Directory managed by use-npm-skills — do not edit, changes get overwritten when the package updates.',
  }
  fs.writeFileSync(path.join(destPath, MARKER), JSON.stringify(marker, null, 2) + '\n')
}

// Returns 'created' | 'updated' | 'up-to-date' | 'skipped'.
// guards.hasTrackedModifications(relPath): true when the path has uncommitted changes to
// git-tracked content — i.e. someone hand-edited committed skill files. Those edits are
// never overwritten.
function ensureEntry(targetDirAbs, targetDirRel, skill, guards, warnings) {
  const destPath = path.join(targetDirAbs, skill.linkName)
  const display = targetDirRel + '/' + skill.linkName
  const st = lstatOrNull(destPath)
  if (st) {
    if (st.isSymbolicLink()) {
      fs.unlinkSync(destPath) // legacy v0.1 link — replaced by a committed copy below
    } else if (st.isDirectory()) {
      const marker = readMarker(destPath)
      if (!marker) {
        warnings.push(`Not overwriting ${display}: it exists but is not managed by use-npm-skills — remove it if use-npm-skills should take the name over`)
        return 'skipped'
      }
      if (marker.package === skill.name && skill.version && marker.version === skill.version) return 'up-to-date'
      if (guards.hasTrackedModifications(display)) {
        warnings.push(`Not updating ${display} to ${skill.name}@${skill.version}: it has uncommitted changes — revert them (git checkout -- ${display}) and re-run, or add "${skill.name}" to package.json#use-npm-skills.exclude`)
        return 'skipped'
      }
      fs.rmSync(destPath, { recursive: true, force: true })
      writeSkillDir(skill, destPath)
      return 'updated'
    } else {
      warnings.push(`Not overwriting ${display}: an unexpected file is in the way`)
      return 'skipped'
    }
  }
  writeSkillDir(skill, destPath)
  return 'created'
}

// Remove managed (npm-*) entries whose skill package is no longer installed. Only ever
// removes what use-npm-skills itself creates: marker-carrying directories (and legacy v0.1
// links). Anything else is warned about and left alone, as are dirs with uncommitted
// changes to tracked content.
function removeStaleEntries(targetDirAbs, targetDirRel, wantedLinkNames, guards, warnings) {
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
      fs.unlinkSync(entryPath) // legacy v0.1 link
      removed.push(display)
    } else if (st.isDirectory() && readMarker(entryPath)) {
      if (guards.hasTrackedModifications(display)) {
        warnings.push(`Not removing ${display}: it has uncommitted changes — revert or commit them, then re-run`)
        continue
      }
      fs.rmSync(entryPath, { recursive: true, force: true })
      removed.push(display)
    } else {
      warnings.push(`${display} looks stale but is not managed by use-npm-skills — leaving it alone`)
    }
  }
  return removed
}

function materializeSkills(ctx, targetDirsRel, skills, guards) {
  const result = { created: [], updated: [], upToDate: [], removed: [], skipped: 0, warnings: [] }
  const wanted = new Set(skills.map((s) => s.linkName))
  for (const dirRel of targetDirsRel) {
    const dirAbs = path.join(ctx.rootDir, dirRel)
    fs.mkdirSync(dirAbs, { recursive: true })
    result.removed.push(...removeStaleEntries(dirAbs, dirRel, wanted, guards, result.warnings))
    for (const skill of skills) {
      const outcome = ensureEntry(dirAbs, dirRel, skill, guards, result.warnings)
      const display = dirRel + '/' + skill.linkName
      if (outcome === 'created') result.created.push(display)
      else if (outcome === 'updated') result.updated.push(display)
      else if (outcome === 'up-to-date') result.upToDate.push(display)
      else result.skipped++
    }
  }
  return result
}

// Used when zero skill packages are installed: clean up leftovers of previously installed
// ones, but never create directories or touch anything else.
function cleanupStaleEntries(ctx, existingDirsRel, guards, warnings) {
  const removed = []
  for (const dirRel of existingDirsRel) {
    const dirAbs = path.join(ctx.rootDir, dirRel)
    if (!lstatOrNull(dirAbs)) continue
    removed.push(...removeStaleEntries(dirAbs, dirRel, new Set(), guards, warnings))
  }
  return removed
}

module.exports = { materializeSkills, cleanupStaleEntries, MARKER }
