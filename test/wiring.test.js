'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { makeProject, makeTmpDir, runCli, runPostinstall, writeFile, exists } = require('./util.js')

function readPkg(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
}

function writeStamp(dir, { mtime } = {}) {
  const stampPath = path.join(dir, 'node_modules', '.use-npm-skills', 'stamp')
  writeFile(stampPath, 'Post-install script ran.\n')
  if (mtime) fs.utimesSync(stampPath, mtime, mtime)
}

test('explicit run wires up postinstall when the stamp is absent', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runCli(dir)
  assert.strictEqual(readPkg(dir).scripts.postinstall, 'npx use-npm-skills')
  assert.match(res.output, /Set package\.json#scripts\.postinstall/)
  assert.match(res.output, /"postinstall": false/) // how to opt out is logged
})

test('explicit run does not wire up postinstall when the stamp is fresh', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeStamp(dir) // written after the lockfile ⇒ fresh
  const res = runCli(dir)
  assert.strictEqual(readPkg(dir).scripts, undefined)
  assert.doesNotMatch(res.output, /postinstall/)
})

test('explicit run wires up postinstall when the stamp is stale (older than the lockfile)', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const past = new Date(Date.now() - 60 * 60 * 1000)
  writeStamp(dir, { mtime: past }) // lockfile is newer ⇒ the last install did not run scripts
  runCli(dir)
  assert.strictEqual(readPkg(dir).scripts.postinstall, 'npx use-npm-skills')
})

test('appends to an existing postinstall script, with a warning', () => {
  const dir = makeProject({
    rootPkg: { scripts: { postinstall: 'echo hello' } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  const res = runCli(dir)
  assert.strictEqual(readPkg(dir).scripts.postinstall, 'echo hello && npx use-npm-skills')
  assert.match(res.output, /WARNING: .*already had a "postinstall" script.*[Dd]ouble-check/)
})

test('leaves a postinstall script alone if it already runs use-npm-skills', () => {
  const dir = makeProject({
    rootPkg: { scripts: { postinstall: 'npx use-npm-skills' } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  runCli(dir)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), before)
})

test('config: postinstall=false disables wiring', () => {
  const dir = makeProject({
    rootPkg: { 'use-npm-skills': { postinstall: false } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  runCli(dir)
  const pkg = readPkg(dir)
  assert.strictEqual(pkg.scripts, undefined)
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a'))) // explicit sync still works
})

test('config: postinstall=false makes lifecycle runs no-ops', () => {
  const dir = makeProject({
    rootPkg: { 'use-npm-skills': { postinstall: false } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  const res = runCli(dir, [], { npm_lifecycle_event: 'postinstall', INIT_CWD: dir })
  assert.strictEqual(res.status, 0)
  assert.match(res.output, /disabled/)
  assert.ok(!exists(path.join(dir, '.claude')))
})

test('lifecycle runs never touch package.json (and honor INIT_CWD)', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const elsewhere = makeTmpDir()
  const res = runCli(elsewhere, [], { npm_lifecycle_event: 'postinstall', INIT_CWD: dir })
  assert.strictEqual(res.status, 0)
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a'))) // synced the INIT_CWD project
  assert.strictEqual(readPkg(dir).scripts, undefined) // but did not wire package.json
})

test('wiring preserves package.json formatting (indentation, key order, trailing newline)', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const styled = '{\n    "name": "styled-app",\n    "version": "1.0.0",\n    "private": true\n}\n'
  fs.writeFileSync(path.join(dir, 'package.json'), styled)
  runCli(dir)
  const after = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
  assert.ok(after.startsWith('{\n    "name": "styled-app",\n    "version": "1.0.0",\n    "private": true,\n    "scripts": {'), after)
  assert.ok(after.endsWith('}\n'))
})

test("the package's own postinstall writes the stamp and syncs, without wiring", () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runPostinstall(dir, { INIT_CWD: dir })
  assert.strictEqual(res.status, 0)
  assert.ok(exists(path.join(dir, 'node_modules', '.use-npm-skills', 'stamp')))
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a')))
  assert.strictEqual(readPkg(dir).scripts, undefined)
})

test("the package's own postinstall does nothing on global installs", () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runPostinstall(dir, { INIT_CWD: dir, npm_config_global: 'true' })
  assert.strictEqual(res.status, 0)
  assert.ok(!exists(path.join(dir, 'node_modules', '.use-npm-skills')))
  assert.ok(!exists(path.join(dir, '.claude')))
})
