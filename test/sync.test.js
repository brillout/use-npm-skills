'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { makeProject, makeTmpDir, installSkillPkg, runCli, writeFile, writeJson, makeDirLink, isLink, exists } = require('./util.js')

const MARKER = '.use-npm-skills.json'

function skillMd(projectDir, dirRel, entryName) {
  return fs.readFileSync(path.join(projectDir, dirRel, entryName, 'SKILL.md'), 'utf8')
}

function readMarker(projectDir, dirRel, entryName) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, dirRel, entryName, MARKER), 'utf8'))
}

// A managed entry as previous runs of the tool would have left it.
function writeManagedDir(projectDir, dirRel, entryName, { pkgName = entryName.replace(/^npm-/, ''), version = '1.0.0', markerName = MARKER } = {}) {
  const dir = path.join(projectDir, dirRel, entryName)
  writeFile(path.join(dir, 'SKILL.md'), `stale content of ${pkgName}\n`)
  writeJson(path.join(dir, markerName), { package: pkgName, version })
  return dir
}

test('copies a skill package (root SKILL.md) into both default dirs as committed content', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runCli(dir)
  assert.strictEqual(res.status, 0)
  for (const target of ['.claude/skills', '.agents/skills']) {
    const entry = path.join(dir, target, 'npm-skill-a')
    assert.ok(!isLink(entry) && fs.statSync(entry).isDirectory(), `${target}: expected a real directory, not a link`)
    assert.match(skillMd(dir, target, 'npm-skill-a'), /test skill of skill-a/)
    const marker = readMarker(dir, target, 'npm-skill-a')
    assert.strictEqual(marker.package, 'skill-a')
    assert.strictEqual(marker.version, '1.0.0')
  }
  assert.ok(!exists(path.join(dir, '.gitignore'))) // nothing is gitignored anymore
  assert.match(res.output, /Synced 1 skill into \.claude\/skills\/ \+ \.agents\/skills\/ \(2 created\)/)
})

test('supports the skills/<dir>/SKILL.md layout', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-b', layout: 'skills', skillDirName: 'inner' }] })
  runCli(dir)
  assert.match(skillMd(dir, '.claude/skills', 'npm-skill-b'), /test skill of skill-b/)
})

test('scoped packages: @matt/grilling → npm-matt-grilling', () => {
  const dir = makeProject({ skillPkgs: [{ name: '@matt/grilling' }] })
  runCli(dir)
  assert.match(skillMd(dir, '.claude/skills', 'npm-matt-grilling'), /test skill of @matt\/grilling/)
})

test('does not copy nested node_modules or .git of a skill package', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeFile(path.join(dir, 'node_modules', 'skill-a', 'node_modules', 'dep', 'index.js'), 'junk\n')
  writeFile(path.join(dir, 'node_modules', 'skill-a', '.git', 'HEAD'), 'ref\n')
  writeFile(path.join(dir, 'node_modules', 'skill-a', 'reference.md'), 'extra skill file\n')
  runCli(dir)
  const entry = path.join(dir, '.claude/skills/npm-skill-a')
  assert.ok(!exists(path.join(entry, 'node_modules')))
  assert.ok(!exists(path.join(entry, '.git')))
  assert.ok(exists(path.join(entry, 'reference.md'))) // other files are copied faithfully
})

test('zero skill packages found ⇒ zero side effects', () => {
  const dir = makeProject()
  installSkillPkg(dir, { name: 'regular-dep', dependsOnUs: false })
  const res = runCli(dir)
  assert.strictEqual(res.status, 0)
  assert.match(res.output, /No skill packages found/)
  assert.ok(!exists(path.join(dir, '.claude')))
  assert.ok(!exists(path.join(dir, '.agents')))
  assert.strictEqual(readPkg(dir).scripts, undefined) // no postinstall wiring
})

test('zero skill packages but stale managed entries ⇒ cleans them up, no other side effects', () => {
  const dir = makeProject()
  installSkillPkg(dir, { name: 'regular-dep', dependsOnUs: false }) // node_modules exists, no skill packages
  writeManagedDir(dir, '.claude/skills', 'npm-gone')
  writeFile(path.join(dir, '.claude/skills/user-skill/SKILL.md'), 'mine\n')
  const res = runCli(dir)
  assert.match(res.output, /removed 1 stale entry/)
  assert.ok(!exists(path.join(dir, '.claude/skills/npm-gone')))
  assert.ok(exists(path.join(dir, '.claude/skills/user-skill/SKILL.md')))
  assert.ok(!exists(path.join(dir, '.agents')))
  assert.strictEqual(readPkg(dir).scripts, undefined)
})

test('a project without node_modules never has its committed skills removed', () => {
  const dir = makeProject() // e.g. a fresh clone: committed skills present, install not yet run
  writeManagedDir(dir, '.claude/skills', 'npm-skill-a')
  const res = runCli(dir)
  assert.strictEqual(res.status, 0)
  assert.match(res.output, /run your package manager's install first/)
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md')))
})

test('re-runs are no-ops', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  runCli(dir)
  const res = runCli(dir)
  assert.match(res.output, /\(2 up-to-date\)/)
})

test('updated skill packages refresh the committed copies', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  runCli(dir)
  installSkillPkg(dir, { name: 'skill-a', version: '2.0.0' })
  const res = runCli(dir)
  assert.match(res.output, /\(2 updated\)/)
  assert.strictEqual(readMarker(dir, '.claude/skills', 'npm-skill-a').version, '2.0.0')
})

test('uninstalled skill packages get their entries removed', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }, { name: 'skill-b' }] })
  runCli(dir)
  fs.rmSync(path.join(dir, 'node_modules', 'skill-b'), { recursive: true })
  const res = runCli(dir)
  assert.ok(!exists(path.join(dir, '.claude/skills/npm-skill-b')))
  assert.ok(!exists(path.join(dir, '.agents/skills/npm-skill-b')))
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a')))
  assert.match(res.output, /2 removed/)
})

test('legacy v0.1 links are replaced by committed copies', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  makeDirLink(path.join(dir, 'node_modules', 'skill-a'), path.join(dir, '.claude/skills/npm-skill-a'))
  const res = runCli(dir)
  const entry = path.join(dir, '.claude/skills/npm-skill-a')
  assert.ok(!isLink(entry) && fs.statSync(entry).isDirectory())
  assert.match(skillMd(dir, '.claude/skills', 'npm-skill-a'), /test skill of skill-a/)
  assert.match(res.output, /1 created/)
})

test('legacy v0.1 copy markers are recognized and refreshed to the new marker name', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeManagedDir(dir, '.claude/skills', 'npm-skill-a', { version: '0.9.0', markerName: '.use-npm-skills-copy.json' })
  runCli(dir)
  assert.strictEqual(readMarker(dir, '.claude/skills', 'npm-skill-a').version, '1.0.0')
  assert.ok(!exists(path.join(dir, '.claude/skills/npm-skill-a/.use-npm-skills-copy.json')))
  assert.match(skillMd(dir, '.claude/skills', 'npm-skill-a'), /test skill of skill-a/)
})

test('removes the legacy v0.1 rule from .gitignore, preserving everything else', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeFile(path.join(dir, '.gitignore'), 'node_modules/\n**/skills/npm-*\ndist/\n')
  const res = runCli(dir)
  assert.strictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'node_modules/\ndist/\n')
  assert.match(res.output, /Removed the legacy use-npm-skills rule/)
})

test('deletes .gitignore when it only contained the legacy rule', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeFile(path.join(dir, '.gitignore'), '**/skills/npm-*\n')
  runCli(dir)
  assert.ok(!exists(path.join(dir, '.gitignore')))
})

test('config: exclude skips (and removes) listed skill packages', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }, { name: 'skill-noisy' }] })
  runCli(dir)
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-noisy')))
  writeJson(path.join(dir, 'package.json'), {
    name: 'test-app',
    private: true,
    'use-npm-skills': { exclude: ['skill-noisy'] },
  })
  const res = runCli(dir)
  assert.match(res.output, /Skipping skill-noisy/)
  assert.ok(!exists(path.join(dir, '.claude/skills/npm-skill-noisy')))
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a')))
})

test('config: skillsDirs overrides the target directories', () => {
  const dir = makeProject({
    rootPkg: { 'use-npm-skills': { skillsDirs: ['custom-skills'] } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  runCli(dir)
  assert.match(skillMd(dir, 'custom-skills', 'npm-skill-a'), /test skill of skill-a/)
  assert.ok(!exists(path.join(dir, '.claude')))
  assert.ok(!exists(path.join(dir, '.agents')))
})

test('config: unknown options produce a warning', () => {
  const dir = makeProject({
    rootPkg: { 'use-npm-skills': { neverCopy: true } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  const res = runCli(dir)
  assert.match(res.output, /Unknown option package\.json#use-npm-skills\.neverCopy/)
})

test('syncs only into existing skills dirs when at least one exists', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  fs.mkdirSync(path.join(dir, '.claude/skills'), { recursive: true })
  runCli(dir)
  assert.ok(exists(path.join(dir, '.claude/skills/npm-skill-a')))
  assert.ok(!exists(path.join(dir, '.agents')))
})

test('never overwrites an entry it does not manage', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  writeFile(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'), 'hand-written\n') // no marker
  const res = runCli(dir)
  assert.strictEqual(fs.readFileSync(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'), 'utf8'), 'hand-written\n')
  assert.match(res.output, /Not overwriting \.claude\/skills\/npm-skill-a/)
  assert.match(res.output, /1 skipped/)
})

test('packages without a SKILL.md (or with several skills) are skipped with a warning', () => {
  const dir = makeProject({
    skillPkgs: [
      { name: 'skill-none', layout: 'none' },
      { name: 'skill-multi', layout: 'multi' },
    ],
  })
  const res = runCli(dir)
  assert.match(res.output, /Skipping installed package skill-none: no SKILL\.md found/)
  assert.match(res.output, /Skipping installed package skill-multi: it contains multiple skills/)
  assert.ok(!exists(path.join(dir, '.claude'))) // both skipped ⇒ zero skills ⇒ zero side effects
})

test('Yarn PnP is unsupported: prints a message, does nothing, exits 0', () => {
  const dir = makeProject({ lockfile: 'yarn.lock', skillPkgs: [{ name: 'skill-a' }] })
  writeFile(path.join(dir, '.pnp.cjs'), '// pnp\n')
  const res = runCli(dir)
  assert.strictEqual(res.status, 0)
  assert.match(res.output, /Yarn PnP .* not supported/)
  assert.ok(!exists(path.join(dir, '.claude')))
})

test('CI ⇒ exit 0 no-op', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runCli(dir, [], { CI: 'true' })
  assert.strictEqual(res.status, 0)
  assert.match(res.output, /CI environment detected/)
  assert.ok(!exists(path.join(dir, '.claude')))
})

test('running outside any project fails with a clear error', () => {
  const dir = path.join(makeTmpDir(), 'empty')
  fs.mkdirSync(dir, { recursive: true })
  const res = runCli(dir)
  assert.strictEqual(res.status, 1)
  assert.match(res.output, /Could not find a project root/)
})

test('unknown arguments fail with help', () => {
  const dir = makeProject()
  const res = runCli(dir, ['frobnicate'])
  assert.strictEqual(res.status, 1)
  assert.match(res.output, /Unknown argument: frobnicate/)
})

test('--version prints the version', () => {
  const dir = makeProject()
  const res = runCli(dir, ['--version'])
  assert.strictEqual(res.status, 0)
  assert.match(res.stdout.trim(), /^\d+\.\d+\.\d+$/)
})

function readPkg(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
}
