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
  skillMd,
  skillPkgDir,
  skillPkgFile,
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
      node_modules: { 'my-skill-pkg': skillPkgFile('my-skill-pkg', 'my-skill') },
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
  test('only packages with the use-npm-skills keyword count', async () => {
    const root = makeProject({
      node_modules: {
        'skill-pkg': skillPkgFile('skill-pkg', 'my-skill'),
        'not-a-skill': { 'package.json': pkgJson('not-a-skill', '1.0.0', ['cli']), 'SKILL.md': skillMd('nope') },
        'no-keywords': { 'package.json': JSON.stringify({ name: 'no-keywords', version: '1.0.0' }) },
      },
    })
    const { result } = await run(root)
    expect(result.actions.map((a) => a.skill)).toEqual(['my-skill'])
    expect(exists(j(root, '.agents', 'skills', 'nope'))).toBe(false)
  })

  test('scoped packages are scanned', async () => {
    const root = makeProject({
      node_modules: { '@acme': { 'skill-pkg': skillPkgFile('@acme/skill-pkg', 'acme-skill') } },
    })
    const { result } = await run(root)
    expect(result.actions).toMatchObject([{ kind: 'added', skill: 'acme-skill', package: '@acme/skill-pkg' }])
  })

  test('a marked package without a skill layout is skipped with a warning', async () => {
    const root = makeProject({
      node_modules: { broken: { 'package.json': pkgJson('broken') } },
    })
    const { result, log } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(log.warnings.join('\n')).toMatch(/ships no skill/)
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('a skill without a frontmatter name is skipped with a warning', async () => {
    const root = makeProject({
      node_modules: { nameless: { 'package.json': pkgJson('nameless'), 'SKILL.md': '# no frontmatter' } },
    })
    const { log } = await run(root)
    expect(log.warnings.join('\n')).toMatch(/no `name` in the frontmatter/)
  })

  test('an invalid skill name is skipped with a warning', async () => {
    const root = makeProject({
      node_modules: { bad: { 'package.json': pkgJson('bad'), 'SKILL.md': skillMd('Bad Name!') } },
    })
    const { log } = await run(root)
    expect(log.warnings.join('\n')).toMatch(/invalid skill name/)
  })
})

describe('materialization', () => {
  test('root SKILL.md layout: only that file is materialized', async () => {
    const root = makeProject({
      node_modules: {
        'skill-pkg': { ...skillPkgFile('skill-pkg', 'my-skill'), 'README.md': 'not part of the skill' },
      },
    })
    await run(root)
    const skillDir = j(root, '.agents', 'skills', 'my-skill')
    expect(read(j(skillDir, 'SKILL.md'))).toBe(skillMd('my-skill'))
    expect(exists(j(skillDir, 'README.md'))).toBe(false)
    expect(readSource(skillDir)).toEqual({
      package: 'skill-pkg',
      version: '1.0.0',
      source: 'SKILL.md',
      hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    })
  })

  test('skill/ layout: the full directory contents are materialized', async () => {
    const root = makeProject({
      node_modules: {
        'skill-pkg': skillPkgDir('skill-pkg', 'my-skill', '2.0.0', {
          'reference.md': 'extra docs',
          scripts: { 'run.js': 'console.log(1)' },
        }),
      },
    })
    await run(root)
    const skillDir = j(root, '.agents', 'skills', 'my-skill')
    expect(exists(j(skillDir, 'SKILL.md'))).toBe(true)
    expect(read(j(skillDir, 'reference.md'))).toBe('extra docs')
    expect(read(j(skillDir, 'scripts', 'run.js'))).toBe('console.log(1)')
    expect(readSource(skillDir)).toMatchObject({ package: 'skill-pkg', version: '2.0.0', source: 'skill/' })
  })

  test('the materialized dir name is the frontmatter name, not the package name', async () => {
    const root = makeProject({
      node_modules: { 'some-npm-name': skillPkgFile('some-npm-name', 'pretty-name') },
    })
    await run(root)
    expect(exists(j(root, '.agents', 'skills', 'pretty-name', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.agents', 'skills', 'some-npm-name'))).toBe(false)
  })

  test('skill-name collision: first package alphabetically wins', async () => {
    const root = makeProject({
      node_modules: {
        'aaa-pkg': skillPkgFile('aaa-pkg', 'shared-name', '1.0.0', 'from aaa'),
        'zzz-pkg': skillPkgFile('zzz-pkg', 'shared-name', '1.0.0', 'from zzz'),
      },
    })
    const { result, log } = await run(root)
    expect(read(j(root, '.agents', 'skills', 'shared-name', 'SKILL.md'))).toContain('from aaa')
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'skipped-collision', package: 'zzz-pkg' }))
    expect(log.warnings.join('\n')).toMatch(/provided by both/)
  })

  test('updates: changed content is replaced, stale files removed', async () => {
    const root = makeProject({
      node_modules: { p: skillPkgDir('p', 's', '1.0.0', { 'old.md': 'old' }) },
    })
    await run(root)
    expect(exists(j(root, '.agents', 'skills', 's', 'old.md'))).toBe(true)

    makeTree(j(root, 'node_modules'), { p: skillPkgDir('p', 's', '2.0.0', { 'new.md': 'new' }) })
    fs.rmSync(j(root, 'node_modules', 'p', 'skill', 'old.md'))
    const { result } = await run(root)
    const skillDir = j(root, '.agents', 'skills', 's')
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated', skill: 's' }))
    expect(exists(j(skillDir, 'old.md'))).toBe(false)
    expect(read(j(skillDir, 'new.md'))).toBe('new')
    expect(readSource(skillDir).version).toBe('2.0.0')
  })

  test('version-only bump refreshes source.json without touching content', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's', '1.0.0') } })
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
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
    await run(root)
    const { result } = await run(root)
    expect(result.actions).toEqual([expect.objectContaining({ kind: 'up-to-date', skill: 's' })])
    expect(result.exitCode).toBe(0)
  })
})

describe('target dirs', () => {
  test('no qualifying dirs: .agents/skills/ is created and used', async () => {
    const root = makeProject({
      node_modules: { p: skillPkgFile('p', 's') },
      '.claude': { skills: {} }, // empty = a Git leftover, not a target
    })
    const { result } = await run(root)
    expect(result.analysis?.physicalDirs).toEqual([j(root, '.agents', 'skills')])
    expect(exists(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.claude', 'skills', 's'))).toBe(false)
  })

  test('an existing skills dir with at least one skill is the target', async () => {
    const root = makeProject({
      node_modules: { p: skillPkgFile('p', 's') },
      '.claude': { skills: { 'user-skill': { 'SKILL.md': skillMd('user-skill') } } },
    })
    await run(root)
    expect(exists(j(root, '.claude', 'skills', 's', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('root-level skills/ and one-level-deep dirs are found; deeper nesting is not', async () => {
    const root = makeProject({
      node_modules: { p: skillPkgFile('p', 's') },
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
      node_modules: { p: skillPkgFile('p', 's') },
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
      node_modules: { p: skillPkgFile('p', 's') },
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
      node_modules: { p: skillPkgFile('p', 's') },
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
      node_modules: { p: skillPkgFile('p', 's') },
      '.agents': { skills: { existing: { 'SKILL.md': skillMd('existing') } } },
      '.claude': { skills: { existing: { 'SKILL.md': skillMd('existing') } } },
    })
    await run(root)
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
    expect(readSource(j(root, '.claude', 'skills', 's')).package).toBe('p')
  })

  test('on Windows, copies are the default', async () => {
    const root = makeProject({
      node_modules: { p: skillPkgFile('p', 's') },
      '.agents': { skills: { u1: { 'SKILL.md': skillMd('u1') } } },
      '.claude': { skills: { u2: { 'SKILL.md': skillMd('u2') } } },
    })
    await run(root, { platform: 'win32' })
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
  })

  test('a target added later gets mirror links on the next run', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
    await run(root) // materializes into .agents/skills
    makeTree(root, { '.cursor': { skills: { u: { 'SKILL.md': skillMd('u') } } } })
    await run(root)
    expect(isLink(j(root, '.cursor', 'skills', 's'))).toBe(true)
    expect(read(j(root, '.cursor', 'skills', 's', 'SKILL.md'))).toBe(skillMd('s'))
  })
})
