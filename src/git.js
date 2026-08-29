'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { DOCS_URL } = require('./context.js')

const BOT_NAME = 'use-npm-skills'
const BOT_EMAIL = 'bot@npm:use-npm-skills'

function commitMessage(title, extraBodyLines) {
  const lines = [
    title,
    '',
    `Automated commit by use-npm-skills (${DOCS_URL}#readme).`,
  ]
  if (extraBodyLines.length > 0) lines.push('', ...extraBodyLines)
  lines.push(
    '',
    'To undo this commit but keep its changes:',
    '    git reset HEAD~1',
    '',
    'To disable automated commits, add to package.json:',
    '    "use-npm-skills": { "gitCommit": false }',
  )
  return lines.join('\n')
}

function git(rootDir, args) {
  return spawnSync('git', args, { cwd: rootDir, encoding: 'utf8', windowsHide: true })
}

function gitOk(result) {
  return !result.error && result.status === 0
}

// Uncommitted state under the given pathspecs, taken BEFORE use-npm-skills modifies anything.
// Returns null when git is unusable, else [{ code, path }] with git status codes ('??' =
// untracked; anything else = a change to tracked content). -z avoids path quoting, -uall
// lists untracked files individually instead of collapsing them into directories.
function getStatus(rootDir, pathspecs) {
  const inRepo = git(rootDir, ['rev-parse', '--is-inside-work-tree'])
  if (!gitOk(inRepo) || inRepo.stdout.trim() !== 'true') return null
  const res = git(rootDir, ['status', '--porcelain', '-z', '-uall', '--', ...pathspecs])
  if (!gitOk(res)) return null
  const parts = res.stdout.split('\0').filter((s) => s.length > 0)
  const entries = []
  let i = 0
  while (i < parts.length) {
    const record = parts[i++]
    const code = record.slice(0, 2)
    entries.push({ code, path: record.slice(3) })
    // Renames/copies carry the original path as an extra NUL-separated record.
    if (code[0] === 'R' || code[0] === 'C' || code[1] === 'R' || code[1] === 'C') {
      if (i < parts.length) entries.push({ code, path: parts[i++] })
    }
  }
  return entries
}

function statusDirty(entries, relPath, trackedOnly) {
  if (!entries) return false
  return entries.some((e) => {
    if (trackedOnly && e.code === '??') return false
    return e.path === relPath || e.path.startsWith(relPath + '/')
  })
}

// Does git track any content at/under this path?
function hasTrackedContent(rootDir, relPath) {
  const res = git(rootDir, ['ls-files', '-z', '--', relPath])
  return gitOk(res) && res.stdout.length > 0
}

function isIgnored(rootDir, relPath) {
  const res = git(rootDir, ['check-ignore', '-q', '--', relPath])
  return !res.error && res.status === 0
}

function getUnsafeState(rootDir) {
  const head = git(rootDir, ['symbolic-ref', '-q', 'HEAD'])
  if (!gitOk(head)) return 'HEAD is detached'
  const gitDirRes = git(rootDir, ['rev-parse', '--git-dir'])
  if (!gitOk(gitDirRes)) return 'could not locate the .git directory'
  const gitDir = path.resolve(rootDir, gitDirRes.stdout.trim())
  const states = [
    ['MERGE_HEAD', 'a merge is in progress'],
    ['rebase-merge', 'a rebase is in progress'],
    ['rebase-apply', 'a rebase is in progress'],
    ['CHERRY_PICK_HEAD', 'a cherry-pick is in progress'],
    ['REVERT_HEAD', 'a revert is in progress'],
    ['BISECT_LOG', 'a bisect is in progress'],
  ]
  for (const [marker, description] of states) {
    if (fs.existsSync(path.join(gitDir, marker))) return description
  }
  return null
}

// Commit exactly the given paths — never signed, never running hooks, never as the user's
// identity, and never sweeping the user's staged or modified files along (the caller only
// passes paths whose pre-run state was clean, or that consist entirely of use-npm-skills
// content). Returns { committed: true } or { skipped: reason }.
function tryCommit(ctx, filesRel, title, extraBodyLines = []) {
  if (ctx.isCI) return { skipped: 'CI environment' }
  const rootDir = ctx.rootDir
  if (!gitOk(git(rootDir, ['--version']))) return { skipped: 'git is not available' }
  const inRepo = git(rootDir, ['rev-parse', '--is-inside-work-tree'])
  if (!gitOk(inRepo) || inRepo.stdout.trim() !== 'true') return { skipped: 'not a git repository' }
  const unsafe = getUnsafeState(rootDir)
  if (unsafe) return { skipped: unsafe }
  const add = git(rootDir, ['add', '--', ...filesRel])
  if (!gitOk(add)) return { skipped: `git add failed: ${(add.stderr || '').trim()}` }
  const commit = git(rootDir, [
    '-c',
    'commit.gpgsign=false',
    '-c',
    `user.name=${BOT_NAME}`,
    '-c',
    `user.email=${BOT_EMAIL}`,
    'commit',
    '--no-verify',
    `--author=${BOT_NAME} <${BOT_EMAIL}>`,
    '-m',
    commitMessage(title, extraBodyLines),
    '--',
    ...filesRel,
  ])
  if (!gitOk(commit)) return { skipped: `git commit failed: ${(commit.stderr || commit.stdout || '').trim()}` }
  return { committed: true }
}

module.exports = { getStatus, statusDirty, hasTrackedContent, isIgnored, tryCommit }
