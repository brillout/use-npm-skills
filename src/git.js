'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { DOCS_URL } = require('./context.js')

const BOT_NAME = 'use-npm-skills'
const BOT_EMAIL = 'bot@npm:use-npm-skills'
const COMMIT_MESSAGE = [
  'Add npm skills',
  '',
  `Automated commit by use-npm-skills (${DOCS_URL}#readme).`,
  '',
  'To undo this commit but keep its changes:',
  '    git reset HEAD~1',
  '',
  'To disable automated commits, add to package.json:',
  '    "use-npm-skills": { "gitCommit": false }',
].join('\n')

function git(rootDir, args) {
  return spawnSync('git', args, { cwd: rootDir, encoding: 'utf8', windowsHide: true })
}

function gitOk(result) {
  return !result.error && result.status === 0
}

// Which of these files already have uncommitted changes? Measured BEFORE use-npm-skills
// modifies anything — user edits must never get swept into an automated commit.
// Returns null when the git status can't be determined.
function getPreexistingDirty(rootDir, filesRel) {
  const inRepo = git(rootDir, ['rev-parse', '--is-inside-work-tree'])
  if (!gitOk(inRepo) || inRepo.stdout.trim() !== 'true') return null
  const dirty = new Set()
  for (const fileRel of filesRel) {
    const res = git(rootDir, ['status', '--porcelain', '--', fileRel])
    if (!gitOk(res)) return null
    if (res.stdout.trim() !== '') dirty.add(fileRel)
  }
  return dirty
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

// Commit exactly the files use-npm-skills changed — never signed, never running hooks, never
// as the user's identity, and never sweeping the user's staged or modified files along.
// Returns { committed: true } or { skipped: reason }.
function tryCommit(ctx, filesRel, dirtyBefore) {
  if (ctx.isCI) return { skipped: 'CI environment' }
  const rootDir = ctx.rootDir
  if (!gitOk(git(rootDir, ['--version']))) return { skipped: 'git is not available' }
  const inRepo = git(rootDir, ['rev-parse', '--is-inside-work-tree'])
  if (!gitOk(inRepo) || inRepo.stdout.trim() !== 'true') return { skipped: 'not a git repository' }
  if (dirtyBefore === null) return { skipped: 'could not determine the git status' }
  for (const fileRel of filesRel) {
    if (dirtyBefore.has(fileRel)) return { skipped: `${fileRel} already had uncommitted changes before use-npm-skills ran` }
  }
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
    COMMIT_MESSAGE,
    '--',
    ...filesRel,
  ])
  if (!gitOk(commit)) return { skipped: `git commit failed: ${(commit.stderr || commit.stdout || '').trim()}` }
  return { committed: true }
}

module.exports = { getPreexistingDirty, tryCommit }
