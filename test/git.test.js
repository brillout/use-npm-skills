'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { makeProject, runCli, writeFile, writeJson, git, gitInit, gitCommitAll, gitLogTitles } = require('./util.js')

function makeRepoProject(opts = {}) {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }], ...opts })
  writeFile(path.join(dir, '.gitignore'), 'node_modules/\n')
  gitInit(dir)
  gitCommitAll(dir)
  return dir
}

test('commits exactly the files it changed, as a bot author', () => {
  const dir = makeRepoProject()
  const res = runCli(dir)
  assert.match(res.output, /Committed \.gitignore and package\.json/)
  assert.match(res.output, /git reset HEAD~1/)
  assert.deepStrictEqual(gitLogTitles(dir), ['Add npm skills', 'user commit'])
  assert.strictEqual(git(dir, ['log', '-1', '--format=%an <%ae>']).trim(), 'use-npm-skills <bot@npm:use-npm-skills>')
  assert.strictEqual(git(dir, ['log', '-1', '--format=%cn <%ce>']).trim(), 'use-npm-skills <bot@npm:use-npm-skills>')
  const committedFiles = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort()
  assert.deepStrictEqual(committedFiles, ['.gitignore', 'package.json'])
  const body = git(dir, ['log', '-1', '--format=%b'])
  assert.match(body, /git reset HEAD~1/)
  assert.match(body, /"gitCommit": false/)
  assert.match(body, /github\.com\/brillout\/use-npm-skills/)
  assert.strictEqual(git(dir, ['status', '--porcelain']).trim(), '') // links are gitignored ⇒ clean tree
})

test('re-runs never commit', () => {
  const dir = makeRepoProject()
  runCli(dir)
  const res = runCli(dir)
  assert.doesNotMatch(res.output, /Committed/)
  assert.strictEqual(gitLogTitles(dir).length, 2)
})

test('never sweeps user-staged files into the automated commit', () => {
  const dir = makeRepoProject()
  writeFile(path.join(dir, 'user-file.txt'), 'user content\n')
  git(dir, ['add', 'user-file.txt'])
  runCli(dir)
  const committedFiles = git(dir, ['show', '--name-only', '--format=', 'HEAD']).trim().split('\n').sort()
  assert.deepStrictEqual(committedFiles, ['.gitignore', 'package.json'])
  assert.strictEqual(git(dir, ['diff', '--cached', '--name-only']).trim(), 'user-file.txt') // still staged
})

test('skips the commit when a target file already had user modifications', () => {
  const dir = makeRepoProject()
  writeJson(path.join(dir, 'package.json'), { name: 'test-app', private: true, description: 'user edit' })
  const res = runCli(dir)
  assert.match(res.output, /commit skipped \(package\.json already had uncommitted changes/)
  assert.strictEqual(gitLogTitles(dir).length, 1) // no new commit
  assert.strictEqual(readPkg(dir).scripts.postinstall, 'npx use-npm-skills') // changes still applied
})

test('skips the commit on a detached HEAD', () => {
  const dir = makeRepoProject()
  git(dir, ['checkout', '-q', '--detach'])
  const res = runCli(dir)
  assert.match(res.output, /commit skipped \(HEAD is detached\)/)
})

test('skips the commit while a merge is in progress', () => {
  const dir = makeRepoProject()
  writeFile(path.join(dir, '.git', 'MERGE_HEAD'), 'deadbeef\n')
  const res = runCli(dir)
  assert.match(res.output, /commit skipped \(a merge is in progress\)/)
})

test('config: gitCommit=false disables commits but still applies the changes', () => {
  const dir = makeRepoProject({ rootPkg: { 'use-npm-skills': { gitCommit: false } } })
  const res = runCli(dir)
  assert.match(res.output, /left uncommitted \(automated commits are disabled/)
  assert.strictEqual(gitLogTitles(dir).length, 1)
  assert.ok(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').includes('**/skills/npm-*'))
})

test('outside a git repository: changes are applied, commit is skipped with a note', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runCli(dir, [], { GIT_CEILING_DIRECTORIES: path.dirname(dir) })
  assert.match(res.output, /commit skipped \(not a git repository\)/)
  assert.ok(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').includes('**/skills/npm-*'))
})

function readPkg(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
}
