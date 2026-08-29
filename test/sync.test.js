'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { makeProject, makeTmpDir, installSkillPkg, runCli, writeFile, writeJson, makeDirLink, isLink, exists } = require('./util.js')

function skillMd(projectDir, dirRel, linkName) {
  return fs.readFileSync(path.join(projectDir, dirRel, linkName, 'SKILL.md'), 'utf8')
}

test('links a skill package (root SKILL.md) into both default dirs and sets up .gitignore', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const res = runCli(dir)
  assert.strictEqual(res.status, 0)
  for (const target of ['.claude/skills', '.agents/skills']) {
    assert.match(skillMd(dir, target, 'npm-skill-a'), /test skill of skill-a/)
  }
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  assert.ok(gitignore.includes('**/skills/npm-*'))
  assert.match(res.output, /Synced 1 skill into \.claude\/skills\/ \+ \.agents\/skills\/ \(2 created\)/)
})

test('links point at the logical node_modules path (relative on POSIX)', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  runCli(dir)
  const linkPath = path.join(dir, '.claude/skills/npm-skill-a')
  assert.ok(isLink(linkPath))
  if (process.platform !== 'win32') {
    const target = fs.readlinkSync(linkPath)
    assert.ok(!path.isAbsolute(target), `expected a relative link target, got: ${target}`)
    assert.ok(target.split(path.sep).join('/').endsWith('node_modules/skill-a'))
    assert.ok(!target.includes('.pnpm'))
  }
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

test('zero skill packages found ⇒ zero side effects', () => {
  const dir = makeProject()
  installSkillPkg(dir, { name: 'regular-dep', dependsOnUs: false })
  const res = runCli(dir)
  assert.strictEqual(res.status, 0)
  assert.match(res.output, /No skill packages found/)
  assert.ok(!exists(path.join(dir, '.claude')))
  assert.ok(!exists(path.join(dir, '.agents')))
  assert.ok(!exists(path.join(dir, '.gitignore')))
  assert.strictEqual(readPkg(dir).scripts, undefined) // no postinstall wiring
})

test('zero skill packages but stale managed entries ⇒ cleans them up, no other side effects', () => {
  const dir = makeProject()
  const elsewhere = path.join(dir, 'somewhere')
  fs.mkdirSync(elsewhere, { recursive: true })
  makeDirLink(elsewhere, path.join(dir, '.claude/skills/npm-gone'))
  writeFile(path.join(dir, '.claude/skills/user-skill/SKILL.md'), 'mine\n')
  const res = runCli(dir)
  assert.match(res.output, /removed 1 stale entry/)
  assert.ok(!exists(path.join(dir, '.claude/skills/npm-gone')))
  assert.ok(exists(path.join(dir, '.claude/skills/user-skill/SKILL.md')))
  assert.ok(!exists(path.join(dir, '.gitignore')))
  assert.ok(!exists(path.join(dir, '.agents')))
})

test('re-runs are no-ops', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  runCli(dir)
  const res = runCli(dir)
  assert.match(res.output, /\(2 up-to-date\)/)
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  assert.strictEqual(gitignore.split('**/skills/npm-*').length - 1, 1) // line not duplicated
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
  const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')
  assert.ok(gitignore.includes('custom-skills/npm-*'))
  assert.ok(!gitignore.includes('**/skills/npm-*'))
})

test('config: unknown options produce a warning', () => {
  const dir = makeProject({
    rootPkg: { 'use-npm-skills': { postInstall: false } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  const res = runCli(dir)
  assert.match(res.output, /Unknown option package\.json#use-npm-skills\.postInstall/)
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
  writeFile(path.join(dir, '.claude/skills/npm-skill-a/SKILL.md'), 'hand-written\n')
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

test('replaces a managed link that points at the wrong target', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const elsewhere = path.join(dir, 'somewhere')
  fs.mkdirSync(elsewhere, { recursive: true })
  fs.mkdirSync(path.join(dir, '.claude/skills'), { recursive: true })
  makeDirLink(elsewhere, path.join(dir, '.claude/skills/npm-skill-a'))
  runCli(dir)
  assert.match(skillMd(dir, '.claude/skills', 'npm-skill-a'), /test skill of skill-a/)
})

test('falls back to copying when links cannot be created', () => {
  const dir = makeProject({ skillPkgs: [{ name: 'skill-a' }] })
  const env = { USE_NPM_SKILLS_TEST_DISABLE_LINKS: '1' }
  const res1 = runCli(dir, [], env)
  assert.match(res1.output, /2 copied/)
  const entry = path.join(dir, '.claude/skills/npm-skill-a')
  assert.ok(!isLink(entry) && fs.statSync(entry).isDirectory())
  assert.match(skillMd(dir, '.claude/skills', 'npm-skill-a'), /test skill of skill-a/)
  const marker = JSON.parse(fs.readFileSync(path.join(entry, '.use-npm-skills-copy.json'), 'utf8'))
  assert.strictEqual(marker.package, 'skill-a')
  assert.strictEqual(marker.version, '1.0.0')

  // Same version ⇒ the copies are current, no churn.
  const res2 = runCli(dir, [], env)
  assert.match(res2.output, /\(2 up-to-date\)/)

  // New version ⇒ the copies are refreshed.
  installSkillPkg(dir, { name: 'skill-a', version: '2.0.0' })
  const res3 = runCli(dir, [], env)
  assert.match(res3.output, /2 copied/)
  const marker2 = JSON.parse(fs.readFileSync(path.join(entry, '.use-npm-skills-copy.json'), 'utf8'))
  assert.strictEqual(marker2.version, '2.0.0')
})

test('config: neverCopy skips instead of copying', () => {
  const dir = makeProject({
    rootPkg: { 'use-npm-skills': { neverCopy: true } },
    skillPkgs: [{ name: 'skill-a' }],
  })
  const res = runCli(dir, [], { USE_NPM_SKILLS_TEST_DISABLE_LINKS: '1' })
  assert.match(res.output, /Could not create a link/)
  assert.match(res.output, /2 skipped/)
  assert.ok(!exists(path.join(dir, '.claude/skills/npm-skill-a')))
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
