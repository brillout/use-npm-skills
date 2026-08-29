'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { makeProject, installSkillPkg, runCli, writeFile, writeJson, git, gitInit, gitCommitAll, gitLogTitles } = require('./util.js')

function makeRepoProject(opts = {}) {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }], ...opts })
  writeFile(path.join(dir, '.gitignore'), 'node_modules/\n')
  gitInit(dir)
  gitCommitAll(dir)
  return dir
}

function commitFiles(dir, ref = 'HEAD') {
  return git(dir, ['show', '--name-only', '--format=', ref]).trim().split('\n').sort()
}

// One managed entry holds the copied skill package content plus the entry marker.
function entryFiles(dirRel, entryName = 'npm-skill-a') {
  return [`${dirRel}/${entryName}/.use-npm-skills.json`, `${dirRel}/${entryName}/SKILL.md`, `${dirRel}/${entryName}/package.json`]
}

test('commits the skill content and package.json as a bot, with provenance', () => {
  const dir = makeRepoProject()
  const res = runCli(dir)
  assert.match(res.output, /Committed .*npm-skill-a.*\("Add npm skills", author: use-npm-skills\)/)
  assert.match(res.output, /git reset HEAD~1/)
  assert.deepStrictEqual(gitLogTitles(dir), ['Add npm skills', 'user commit'])
  assert.strictEqual(git(dir, ['log', '-1', '--format=%an <%ae>']).trim(), 'use-npm-skills <bot@npm:use-npm-skills>')
  assert.strictEqual(git(dir, ['log', '-1', '--format=%cn <%ce>']).trim(), 'use-npm-skills <bot@npm:use-npm-skills>')
  const expected = [...entryFiles('.agents/skills'), ...entryFiles('.claude/skills'), 'package.json'].sort()
  assert.deepStrictEqual(commitFiles(dir), expected)
  const body = git(dir, ['log', '-1', '--format=%b'])
  assert.match(body, /Skill packages: skill-a@1\.0\.0/)
  assert.match(body, /git reset HEAD~1/)
  assert.match(body, /"gitCommit": false/)
  assert.match(body, /github\.com\/brillout\/use-npm-skills/)
  assert.strictEqual(git(dir, ['status', '--porcelain']).trim(), '') // everything committed ⇒ clean tree
})

test('re-runs never commit', () => {
  const dir = makeRepoProject()
  runCli(dir)
  const res = runCli(dir)
  assert.doesNotMatch(res.output, /Committed/)
  assert.strictEqual(gitLogTitles(dir).length, 2)
})

test('skill package updates land as an "Update npm skills" commit', () => {
  const dir = makeRepoProject()
  runCli(dir)
  installSkillPkg(dir, { name: 'skill-a', version: '2.0.0' })
  runCli(dir)
  assert.strictEqual(gitLogTitles(dir)[0], 'Update npm skills')
  assert.match(git(dir, ['log', '-1', '--format=%b']), /Skill packages: skill-a@2\.0\.0/)
  assert.strictEqual(git(dir, ['status', '--porcelain']).trim(), '')
})

test('uninstalling a skill package lands as a committed removal', () => {
  const dir = makeRepoProject()
  runCli(dir)
  fs.rmSync(path.join(dir, 'node_modules', 'skill-a'), { recursive: true })
  runCli(dir)
  assert.strictEqual(gitLogTitles(dir)[0], 'Update npm skills')
  assert.ok(!fs.existsSync(path.join(dir, '.claude/skills/npm-skill-a')))
  const lastCommit = commitFiles(dir)
  assert.ok(lastCommit.includes('.claude/skills/npm-skill-a/SKILL.md'))
  assert.strictEqual(git(dir, ['status', '--porcelain']).trim(), '')
})

test('never sweeps user-staged files into the automated commit', () => {
  const dir = makeRepoProject()
  writeFile(path.join(dir, 'user-file.txt'), 'user content\n')
  git(dir, ['add', 'user-file.txt'])
  runCli(dir)
  assert.ok(!commitFiles(dir).includes('user-file.txt'))
  assert.strictEqual(git(dir, ['diff', '--cached', '--name-only']).trim(), 'user-file.txt') // still staged
})

test('a pre-dirty package.json stays out of the commit; the skill content is still committed', () => {
  const dir = makeRepoProject()
  writeJson(path.join(dir, 'package.json'), { name: 'test-app', private: true, description: 'user edit' })
  const res = runCli(dir)
  assert.match(res.output, /package\.json already had uncommitted changes before this run/)
  assert.strictEqual(gitLogTitles(dir)[0], 'Add npm skills')
  const committed = commitFiles(dir)
  assert.ok(!committed.includes('package.json'))
  assert.ok(committed.includes('.claude/skills/npm-skill-a/SKILL.md'))
  assert.strictEqual(readPkg(dir).scripts.postinstall, 'npx use-npm-skills') // wiring still applied, left uncommitted
})

test('hand-edited committed skill content is never overwritten', () => {
  const dir = makeRepoProject()
  runCli(dir)
  writeFile(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'), 'my hand edit\n')
  installSkillPkg(dir, { name: 'skill-a', version: '2.0.0' })
  const res = runCli(dir)
  assert.match(res.output, /Not updating \.claude\/skills\/npm-skill-a/)
  assert.strictEqual(fs.readFileSync(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'), 'utf8'), 'my hand edit\n')
  // The untouched twin directory is still updated and committed. (Its SKILL.md content is
  // identical across the two versions, so the marker file is what shows up in the commit.)
  assert.strictEqual(gitLogTitles(dir)[0], 'Update npm skills')
  assert.ok(commitFiles(dir).includes('.agents/skills/npm-skill-a/.use-npm-skills.json'))
  assert.match(fs.readFileSync(path.join(dir, '.agents/skills/npm-skill-a/SKILL.md'), 'utf8'), /test skill of skill-a/)
})

test('skips the commit on a detached HEAD', () => {
  const dir = makeRepoProject()
  git(dir, ['checkout', '-q', '--detach'])
  const res = runCli(dir)
  assert.match(res.output, /Left uncommitted \(HEAD is detached\)/)
  assert.strictEqual(gitLogTitles(dir).length, 1)
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'))) // changes still applied
})

test('skips the commit while a merge is in progress', () => {
  const dir = makeRepoProject()
  writeFile(path.join(dir, '.git', 'MERGE_HEAD'), 'deadbeef\n')
  const res = runCli(dir)
  assert.match(res.output, /Left uncommitted \(a merge is in progress\)/)
})

test('config: gitCommit=false disables commits but still applies the changes', () => {
  const dir = makeRepoProject({ rootPkg: { 'use-npm-skills': { gitCommit: false } } })
  const res = runCli(dir)
  assert.match(res.output, /Left uncommitted \(automated commits are disabled/)
  assert.strictEqual(gitLogTitles(dir).length, 1)
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md')))
})

test('re-enabling gitCommit commits skills that earlier runs left uncommitted', () => {
  const dir = makeRepoProject({ rootPkg: { 'use-npm-skills': { gitCommit: false } } })
  runCli(dir) // materialized, nothing committed
  writeJson(path.join(dir, 'package.json'), { name: 'test-app', private: true }) // gitCommit back to default
  const res = runCli(dir)
  assert.strictEqual(gitLogTitles(dir)[0], 'Update npm skills')
  const committed = commitFiles(dir)
  assert.ok(committed.includes('.claude/skills/npm-skill-a/SKILL.md'))
  assert.ok(!committed.includes('package.json')) // pre-dirty (the config edit) — left for the user
  assert.match(res.output, /\(2 up-to-date\)/)
})

test('warns instead of committing paths the user gitignores', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeFile(path.join(dir, '.gitignore'), 'node_modules/\n.claude/\n')
  gitInit(dir)
  gitCommitAll(dir)
  const res = runCli(dir)
  assert.match(res.output, /\.claude\/skills\/npm-skill-a is ignored by \.gitignore/)
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'))) // materialized anyway
  const committed = commitFiles(dir)
  assert.ok(!committed.some((f) => f.startsWith('.claude/'))) // the ignored path is not committed
  assert.ok(committed.some((f) => f.startsWith('.agents/'))) // the unignored twin is
})

test('outside a git repository: changes are applied, commit is skipped with a note', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runCli(dir, [], { GIT_CEILING_DIRECTORIES: path.dirname(dir) })
  assert.match(res.output, /Left uncommitted \(not a git repository\)/)
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md')))
})

function readPkg(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
}
