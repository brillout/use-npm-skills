import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { UsageError } from '../src/types.js'
import { copyMode, exists, isLink, j, linkTarget, makeProject, pkgJson, read, readSource, run, skillDir, skillPkg } from './helpers.js'

describe('.use-npm-skills.json', () => {
  test('exclude: the package is skipped and its link removed', async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's') } })
    await run(root)
    expect(exists(j(root, '.agents', 'skills', 's'))).toBe(true)

    fs.writeFileSync(j(root, '.use-npm-skills.json'), JSON.stringify({ exclude: ['p'] }))
    const { result } = await run(root)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'excluded', package: 'p' }))
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'removed', skill: 's' }))
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual([])
  })

  test('exclude covers every skill of the package', async () => {
    const root = makeProject({
      node_modules: { lib: { 'package.json': pkgJson('lib'), skills: { a: skillDir('a'), b: skillDir('b') } } },
    })
    await run(root)
    fs.writeFileSync(j(root, '.use-npm-skills.json'), JSON.stringify({ exclude: ['lib'] }))
    const { result } = await run(root)
    expect(result.actions.filter((a) => a.kind === 'excluded').map((a) => a.skill)).toEqual(['a', 'b'])
    expect(result.actions.filter((a) => a.kind === 'removed').map((a) => a.skill)).toEqual(['a', 'b'])
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual([])
  })

  test('skillsDirs overrides discovery', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.use-npm-skills.json': JSON.stringify({ skillsDirs: ['tools/skills', '.claude/skills'] }),
    })
    const { result } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(linkTarget(j(root, '.claude', 'skills', 's'))).toBe('../../node_modules/p/skills/s')
    expect(linkTarget(j(root, 'tools', 'skills', 's'))).toBe('../../node_modules/p/skills/s')
    expect(read(j(root, 'tools', 'skills', 's', 'SKILL.md'))).toContain('# s')
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('mode: "copy" copies the skills instead of linking them', async () => {
    const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
    const { result } = await run(root)
    expect(result.analysis?.mode).toBe('copy')
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(readSource(j(root, '.agents', 'skills', 's')).package).toBe('p')
  })

  test('mode must be "symlink" or "copy"', async () => {
    const root = makeProject({ node_modules: {}, '.use-npm-skills.json': JSON.stringify({ mode: 'hardlink' }) })
    await expect(run(root)).rejects.toThrow(/"mode" must be "symlink" or "copy"/)
  })

  test('invalid JSON is a usage error', async () => {
    const root = makeProject({
      node_modules: {},
      '.use-npm-skills.json': '{ not json',
    })
    await expect(run(root)).rejects.toThrow(UsageError)
  })

  test('a skillsDirs entry outside the project is refused', async () => {
    const root = makeProject({
      node_modules: {},
      '.use-npm-skills.json': JSON.stringify({ skillsDirs: ['../outside'] }),
    })
    await expect(run(root)).rejects.toThrow(/outside the project/)
  })

  test('unknown keys warn', async () => {
    const root = makeProject({
      node_modules: {},
      '.use-npm-skills.json': JSON.stringify({ skillsDir: ['typo'] }),
    })
    const { log } = await run(root)
    expect(log.warnings.join('\n')).toMatch(/unknown key "skillsDir"/)
  })

  describe('copy mode', () => {
    test('exclude keeps the changes of a modified skill (adoption)', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'my tweak')

      fs.writeFileSync(j(root, '.use-npm-skills.json'), JSON.stringify({ mode: 'copy', exclude: ['p'] }))
      const { result } = await run(root)
      expect(result.exitCode).toBe(0)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'adopted', skill: 's' }))
      expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('my tweak')
      expect(exists(j(root, '.agents', 'skills', 's', 'source.json'))).toBe(false)
    })

    test('skillsDirs: the first target alphabetically becomes the primary dir', async () => {
      const root = makeProject({
        node_modules: { p: skillPkg('p', 's') },
        '.use-npm-skills.json': JSON.stringify({ mode: 'copy', skillsDirs: ['tools/skills', '.claude/skills'] }),
      })
      const { result } = await run(root)
      expect(result.exitCode).toBe(0)
      expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(false)
      expect(exists(j(root, '.claude', 'skills', 's', 'SKILL.md'))).toBe(true)
      expect(linkTarget(j(root, 'tools', 'skills', 's'))).toBe('../../.claude/skills/s')
      expect(exists(j(root, '.agents'))).toBe(false)
    })
  })
})
