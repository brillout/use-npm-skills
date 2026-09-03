import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { UsageError } from '../src/types.js'
import {
  exists,
  isLink,
  j,
  linkTarget,
  makeProject,
  makeTree,
  pkgJson,
  read,
  readSource,
  run,
  skillDir,
  skillMd,
  skillPkg,
} from './helpers.js'

describe('root resolution', () => {
  test('errors without a lockfile', async () => {
    const root = makeProject()
    fs.rmSync(j(root, 'package-lock.json'))
    await expect(run(root)).rejects.toThrow(UsageError)
  })

  test('errors without node_modules', async () => {
    const root = makeProject()
    await expect(run(root)).rejects.toThrow(/node_modules/)
  })

  test('walks up to the lockfile (monorepo workspace root)', async () => {
    const root = makeProject({
      'pnpm-lock.yaml': '',
      node_modules: { 'my-skill-pkg': skillPkg('my-skill-pkg', 'my-skill') },
      packages: { app: { 'package.json': '{}' } },
    })
    fs.rmSync(j(root, 'package-lock.json'))
    const { result } = await run(j(root, 'packages', 'app'))
    expect(result.root).toBe(root)
    expect(exists(j(root, '.agents', 'skills', 'my-skill', 'SKILL.md'))).toBe(true)
  })

  test('Yarn PnP is unsupported: exit 0, nothing done', async () => {
    const root = makeProject({ 'yarn.lock': '', '.pnp.cjs': '' })
    const { result } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(exists(j(root, '.agents'))).toBe(false)
  })
})

describe('enumeration', () => {
  test('a skills/ directory is the only marker: keywords are irrelevant', async () => {
    const root = makeProject({
      node_modules: {
        'skill-pkg': skillPkg('skill-pkg', 'my-skill'),
        'keyword-only': {
          'package.json': JSON.stringify({ name: 'keyword-only', version: '1.0.0', keywords: ['use-npm-skills'] }),
          'SKILL.md': skillMd('keyword-only'),
        },
        'plain-lib': { 'package.json': pkgJson('plain-lib'), 'index.js': '' },
      },
    })
    const { result, log } = await run(root)
    expect(result.actions.map((a) => a.skill)).toEqual(['my-skill'])
    expect(log.warnings).toEqual([])
  })

  test('scoped packages are scanned', async () => {
    const root = makeProject({
      node_modules: { '@acme': { 'skill-pkg': skillPkg('@acme/skill-pkg', 'acme-skill') } },
    })
    const { result } = await run(root)
    expect(result.actions).toMatchObject([{ kind: 'added', skill: 'acme-skill', package: '@acme/skill-pkg' }])
  })

  test('root SKILL.md, skill/, a files-only skills/, or skills/ without a package.json make no skill package', async () => {
    const root = makeProject({
      node_modules: {
        'root-layout': { 'package.json': pkgJson('root-layout'), 'SKILL.md': skillMd('root-layout') },
        'singular-layout': { 'package.json': pkgJson('singular-layout'), skill: skillDir('singular-layout') },
        'files-only': { 'package.json': pkgJson('files-only'), skills: { 'README.md': 'no skills here' } },
        'not-a-package': { skills: { stray: skillDir('stray') } },
      },
    })
    const { result, log } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(result.actions).toEqual([])
    expect(log.warnings).toEqual([])
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('a package shipping several skills: each is materialized with its own source.json', async () => {
    const root = makeProject({
      node_modules: {
        'my-lib': {
          'package.json': pkgJson('my-lib', '3.1.0'),
          'index.js': 'module.exports = {}',
          skills: { 'my-lib-setup': skillDir('my-lib-setup'), 'my-lib-testing': skillDir('my-lib-testing') },
        },
      },
    })
    const { result } = await run(root)
    expect(result.actions).toMatchObject([
      { kind: 'added', skill: 'my-lib-setup', package: 'my-lib' },
      { kind: 'added', skill: 'my-lib-testing', package: 'my-lib' },
    ])
    for (const skill of ['my-lib-setup', 'my-lib-testing']) {
      const dir = j(root, '.agents', 'skills', skill)
      expect(read(j(dir, 'SKILL.md'))).toBe(skillMd(skill))
      expect(readSource(dir)).toMatchObject({ package: 'my-lib', version: '3.1.0' })
    }
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['my-lib-setup', 'my-lib-testing'])
  })

  test('files in skills/ are ignored; a subdirectory without SKILL.md is skipped with a warning, siblings still sync', async () => {
    const root = makeProject({
      node_modules: {
        p: {
          'package.json': pkgJson('p'),
          skills: {
            'README.md': 'about these skills',
            good: skillDir('good'),
            shared: { 'helper.md': 'no SKILL.md' },
          },
        },
      },
    })
    const { result, log } = await run(root)
    expect(result.actions).toMatchObject([{ kind: 'added', skill: 'good' }])
    expect(log.warnings.join('\n')).toMatch(/skills\/shared\/ has no SKILL\.md/)
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['good'])
  })

  test('a frontmatter name that differs from the directory name is skipped with a warning', async () => {
    const root = makeProject({
      node_modules: {
        p: { 'package.json': pkgJson('p'), skills: { 'dir-name': { 'SKILL.md': skillMd('other-name') } } },
      },
    })
    const { result, log } = await run(root)
    expect(result.actions).toEqual([])
    expect(log.warnings.join('\n')).toMatch(/frontmatter `name` .* is "other-name" but the directory is named "dir-name"/)
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('a skill without a frontmatter name is skipped with a warning', async () => {
    const root = makeProject({
      node_modules: {
        nameless: { 'package.json': pkgJson('nameless'), skills: { nameless: { 'SKILL.md': '# no frontmatter' } } },
      },
    })
    const { log } = await run(root)
    expect(log.warnings.join('\n')).toMatch(/no `name` in the frontmatter/)
  })

  test('an invalid skill directory name is skipped with a warning', async () => {
    const root = makeProject({
      node_modules: {
        bad: { 'package.json': pkgJson('bad'), skills: { 'Bad Name!': { 'SKILL.md': skillMd('Bad Name!') } } },
      },
    })
    const { log } = await run(root)
    expect(log.warnings.join('\n')).toMatch(/invalid skill name/)
  })
})

describe('materialization', () => {
  test('the full contents of skills/<name>/ are materialized — package files outside it are not', async () => {
    const root = makeProject({
      node_modules: {
        'skill-pkg': {
          ...skillPkg('skill-pkg', 'my-skill', '2.0.0', {
            'reference.md': 'extra docs',
            scripts: { 'run.js': 'console.log(1)' },
          }),
          'README.md': 'not part of the skill',
        },
      },
    })
    await run(root)
    const skillDir = j(root, '.agents', 'skills', 'my-skill')
    expect(read(j(skillDir, 'SKILL.md'))).toBe(skillMd('my-skill'))
    expect(read(j(skillDir, 'reference.md'))).toBe('extra docs')
    expect(read(j(skillDir, 'scripts', 'run.js'))).toBe('console.log(1)')
    expect(exists(j(skillDir, 'README.md'))).toBe(false)
    expect(exists(j(skillDir, 'package.json'))).toBe(false)
    expect(readSource(skillDir)).toEqual({
      package: 'skill-pkg',
      version: '2.0.0',
      hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
  })

  test('the materialized dir name is the skill name, not the package name', async () => {
    const root = makeProject({
      node_modules: { 'some-npm-name': skillPkg('some-npm-name', 'pretty-name') },
    })
    await run(root)
    expect(exists(j(root, '.agents', 'skills', 'pretty-name', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.agents', 'skills', 'some-npm-name'))).toBe(false)
  })

  test('skill-name collision: first package alphabetically wins', async () => {
    const root = makeProject({
      node_modules: {
        'aaa-pkg': skillPkg('aaa-pkg', 'shared-name', '1.0.0', { 'SKILL.md': skillMd('shared-name', 'from aaa') }),
        'zzz-pkg': skillPkg('zzz-pkg', 'shared-name', '1.0.0', { 'SKILL.md': skillMd('shared-name', 'from zzz') }),
      },
    })
    const { result, log } = await run(root)
    expect(read(j(root, '.agents', 'skills', 'shared-name', 'SKILL.md'))).toContain('from aaa')
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'skipped-collision', package: 'zzz-pkg' }))
    expect(log.warnings.join('\n')).toMatch(/provided by both/)
  })

  test('updates: changed content is replaced, stale files removed', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's', '1.0.0', { 'old.md': 'old' }) },
    })
    await run(root)
    expect(exists(j(root, '.agents', 'skills', 's', 'old.md'))).toBe(true)

    makeTree(j(root, 'node_modules'), { p: skillPkg('p', 's', '2.0.0', { 'new.md': 'new' }) })
    fs.rmSync(j(root, 'node_modules', 'p', 'skills', 's', 'old.md'))
    const { result } = await run(root)
    const skillDir = j(root, '.agents', 'skills', 's')
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated', skill: 's' }))
    expect(exists(j(skillDir, 'old.md'))).toBe(false)
    expect(read(j(skillDir, 'new.md'))).toBe('new')
    expect(readSource(skillDir).version).toBe('2.0.0')
  })

  test('version-only bump refreshes source.json without touching content', async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's', '1.0.0') } })
    await run(root)
    const before = readSource(j(root, '.agents', 'skills', 's'))
    makeTree(j(root, 'node_modules'), { p: { 'package.json': pkgJson('p', '1.0.1') } })
    const { result } = await run(root)
    const after = readSource(j(root, '.agents', 'skills', 's'))
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated' }))
    expect(after.version).toBe('1.0.1')
    expect(after.hash).toBe(before.hash)
  })

  test('a second run is idempotent (up-to-date)', async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's') } })
    await run(root)
    const { result } = await run(root)
    expect(result.actions).toEqual([expect.objectContaining({ kind: 'up-to-date', skill: 's' })])
    expect(result.exitCode).toBe(0)
  })
})

describe('target dirs', () => {
  test('no qualifying dirs: .agents/skills/ is created and used', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.claude': { skills: {} }, // empty = a Git leftover, not a target
    })
    const { result } = await run(root)
    expect(result.analysis?.physicalDirs).toEqual([j(root, '.agents', 'skills')])
    expect(exists(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.claude', 'skills', 's'))).toBe(false)
  })

  test('an existing skills dir with at least one skill is the target', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.claude': { skills: { 'user-skill': { 'SKILL.md': skillMd('user-skill') } } },
    })
    await run(root)
    expect(exists(j(root, '.claude', 'skills', 's', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('root-level skills/ and one-level-deep dirs are found; deeper nesting is not', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      skills: { 'user-skill': { 'SKILL.md': skillMd('user-skill') } },
      apps: { web: { '.claude': { skills: { deep: { 'SKILL.md': skillMd('deep') } } } } },
    })
    const { result } = await run(root)
    expect(result.analysis?.physicalDirs).toEqual([j(root, 'skills')])
    expect(exists(j(root, 'skills', 's', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, 'apps', 'web', '.claude', 'skills', 's'))).toBe(false)
  })

  test('multiple targets: real files in .agents/skills, relative symlinks elsewhere', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.agents': { skills: { u1: { 'SKILL.md': skillMd('u1') } } },
      '.claude': { skills: { u2: { 'SKILL.md': skillMd('u2') } } },
    })
    await run(root)
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(true)
    expect(linkTarget(j(root, '.claude', 'skills', 's'))).toBe('../../.agents/skills/s')
    expect(read(j(root, '.claude', 'skills', 's', 'SKILL.md'))).toBe(skillMd('s'))
  })

  test('dir-level symlink: one physical dir, nothing mirrored', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.agents': { skills: { u1: { 'SKILL.md': skillMd('u1') } } },
      '.claude': {},
    })
    fs.symlinkSync(j('..', '.agents', 'skills'), j(root, '.claude', 'skills'))
    const { result } = await run(root)
    expect(result.analysis?.physicalDirs).toEqual([j(root, '.agents', 'skills')])
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    // visible through the dir-level link, but not a separate entry
    expect(exists(j(root, '.claude', 'skills', 's', 'SKILL.md'))).toBe(true)
    expect(isLink(j(root, '.claude', 'skills'))).toBe(true)
  })
})

describe('structure analysis wins over the default', () => {
  test('existing per-skill symlink pattern: its primary dir is kept', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.claude': { skills: { existing: { 'SKILL.md': skillMd('existing') } } },
      '.agents': { skills: {} },
    })
    fs.mkdirSync(j(root, '.agents', 'skills'), { recursive: true })
    fs.symlinkSync(j('..', '..', '.claude', 'skills', 'existing'), j(root, '.agents', 'skills', 'existing'))
    await run(root)
    // primary follows the existing pattern: real files in .claude/skills
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(true)
  })

  test('existing duplicated-copies pattern: copies everywhere', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.agents': { skills: { existing: { 'SKILL.md': skillMd('existing') } } },
      '.claude': { skills: { existing: { 'SKILL.md': skillMd('existing') } } },
    })
    await run(root)
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
    expect(readSource(j(root, '.claude', 'skills', 's')).package).toBe('p')
  })

  test('on Windows without Git symlink support, copies are the default', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.agents': { skills: { u1: { 'SKILL.md': skillMd('u1') } } },
      '.claude': { skills: { u2: { 'SKILL.md': skillMd('u2') } } },
    })
    await run(root, { platform: 'win32', gitSymlinks: () => false })
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
  })

  test('on Windows with Git symlink support, symlinks are the default', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.agents': { skills: { u1: { 'SKILL.md': skillMd('u1') } } },
      '.claude': { skills: { u2: { 'SKILL.md': skillMd('u2') } } },
    })
    await run(root, { platform: 'win32', gitSymlinks: () => true })
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(true)
    expect(linkTarget(j(root, '.claude', 'skills', 's'))).toBe('../../.agents/skills/s')
  })

  test('on Windows, an existing symlink pattern wins even without Git symlink support', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.claude': { skills: { existing: { 'SKILL.md': skillMd('existing') } } },
      '.agents': { skills: {} },
    })
    fs.mkdirSync(j(root, '.agents', 'skills'), { recursive: true })
    fs.symlinkSync(j('..', '..', '.claude', 'skills', 'existing'), j(root, '.agents', 'skills', 'existing'))
    await run(root, { platform: 'win32', gitSymlinks: () => false })
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(true)
  })

  test('a target added later gets mirror links on the next run', async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's') } })
    await run(root) // materializes into .agents/skills
    makeTree(root, { '.cursor': { skills: { u: { 'SKILL.md': skillMd('u') } } } })
    await run(root)
    expect(isLink(j(root, '.cursor', 'skills', 's'))).toBe(true)
    expect(read(j(root, '.cursor', 'skills', 's', 'SKILL.md'))).toBe(skillMd('s'))
  })
})
