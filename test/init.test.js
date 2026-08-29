'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { makeTmpDir, runCli, writeFile, readJson } = require('./util.js')

const OWN_VERSION = require('../package.json').version

test('init scaffolds a skill package in an empty directory', () => {
  const dir = path.join(makeTmpDir(), 'grilling-master')
  fs.mkdirSync(dir, { recursive: true })
  const res = runCli(dir, ['init'])
  assert.strictEqual(res.status, 0)
  const pkg = readJson(path.join(dir, 'package.json'))
  assert.strictEqual(pkg.name, 'grilling-master')
  assert.deepStrictEqual(pkg.files, ['SKILL.md'])
  assert.strictEqual(pkg.dependencies['use-npm-skills'], '^' + OWN_VERSION)
  const skillMd = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8')
  assert.match(skillMd, /^---\nname: grilling-master\ndescription: /)
  assert.match(res.output, /npm publish/)
})

test('init sanitizes the directory name into a valid package name', () => {
  const dir = path.join(makeTmpDir(), 'My Skill!')
  fs.mkdirSync(dir, { recursive: true })
  runCli(dir, ['init'])
  assert.strictEqual(readJson(path.join(dir, 'package.json')).name, 'my-skill')
})

test('init extends an existing package.json without clobbering it', () => {
  const dir = makeTmpDir()
  writeFile(
    path.join(dir, 'package.json'),
    '{\n    "name": "@matt/grilling",\n    "version": "3.2.1",\n    "description": "Grilling wisdom"\n}\n',
  )
  const res = runCli(dir, ['init'])
  assert.strictEqual(res.status, 0)
  const pkg = readJson(path.join(dir, 'package.json'))
  assert.strictEqual(pkg.name, '@matt/grilling')
  assert.strictEqual(pkg.version, '3.2.1')
  assert.strictEqual(pkg.description, 'Grilling wisdom')
  assert.strictEqual(pkg.dependencies['use-npm-skills'], '^' + OWN_VERSION)
  assert.ok(fs.readFileSync(path.join(dir, 'package.json'), 'utf8').includes('    "name"')) // 4-space indent kept
  assert.match(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), /name: matt-grilling/)
})

test('init leaves an existing SKILL.md alone', () => {
  const dir = makeTmpDir()
  writeFile(path.join(dir, 'SKILL.md'), 'my existing skill\n')
  const res = runCli(dir, ['init'])
  assert.strictEqual(res.status, 0)
  assert.strictEqual(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'), 'my existing skill\n')
})

test('init leaves an existing skills/<dir>/SKILL.md layout alone', () => {
  const dir = makeTmpDir()
  writeFile(path.join(dir, 'skills', 'inner', 'SKILL.md'), 'inner skill\n')
  runCli(dir, ['init'])
  assert.ok(!fs.existsSync(path.join(dir, 'SKILL.md')))
})
