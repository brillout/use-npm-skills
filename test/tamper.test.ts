import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  copyMode,
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
  twoTargets,
} from './helpers.js'

describe('user-authored skills always win', () => {
  test('an existing skill dir of the user is never touched', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      '.agents': { skills: { s: { 'SKILL.md': skillMd('s', 'hand-written') } } },
    })
    const { result, log } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'skipped-user-owned', skill: 's' }))
    expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('hand-written')
    expect(log.warnings.join('\n')).toMatch(/user-authored/)
  })

  test("a symlink of the user's own, to content of their own, is never touched", async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      'my-skills': { s: { 'SKILL.md': skillMd('s', 'hand-written') } },
      '.agents': { skills: { u: skillDir('u') } },
    })
    fs.symlinkSync('../../my-skills/s', j(root, '.agents', 'skills', 's'), 'dir')
    const { result } = await run(root)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'skipped-user-owned', skill: 's' }))
    expect(linkTarget(j(root, '.agents', 'skills', 's'))).toBe('../../my-skills/s')
  })

  test('user content blocks the skill only in the skills dir where it stands', async () => {
    const root = makeProject({
      node_modules: { p: skillPkg('p', 's') },
      ...twoTargets,
      '.claude': { skills: { s: { 'SKILL.md': skillMd('s', 'hand-written') } } },
    })
    const { result, log } = await run(root)
    expect(result.actions).toEqual([{ kind: 'added', skill: 's', package: 'p', detail: '.agents/skills' }])
    expect(linkTarget(j(root, '.agents', 'skills', 's'))).toBe('../../node_modules/p/skills/s')
    expect(read(j(root, '.claude', 'skills', 's', 'SKILL.md'))).toContain('hand-written')
    expect(log.warnings.join('\n')).toMatch(/skill `s` in .claude\/skills is user-authored/)
  })
})

describe('pruning', () => {
  test('uninstalling a package removes its links from every skills dir', async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's'), q: skillPkg('q', 't') }, ...twoTargets })
    await run(root)
    fs.rmSync(j(root, 'node_modules', 'p'), { recursive: true })
    const { result } = await run(root)
    expect(result.actions).toContainEqual({ kind: 'removed', skill: 's', package: 'p', detail: '.agents/skills, .claude/skills' })
    expect(fs.readdirSync(j(root, '.agents', 'skills')).sort()).toEqual(['t', 'u1'])
    expect(fs.readdirSync(j(root, '.claude', 'skills')).sort()).toEqual(['t', 'u2'])
  })

  test('a skill dropped by a new version of its package is removed, its siblings kept', async () => {
    const root = makeProject({
      node_modules: { lib: { 'package.json': pkgJson('lib', '1.0.0'), skills: { a: skillDir('a'), b: skillDir('b') } } },
    })
    await run(root)
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['a', 'b'])

    makeTree(j(root, 'node_modules'), { lib: { 'package.json': pkgJson('lib', '2.0.0') } })
    fs.rmSync(j(root, 'node_modules', 'lib', 'skills', 'b'), { recursive: true })
    const { result } = await run(root)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'up-to-date', skill: 'a', package: 'lib' }))
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'removed', skill: 'b', package: 'lib' }))
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['a'])
  })

  test('a skills dir left with nothing but dangling links is still pruned', async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's') }, '.claude': { skills: { u: skillDir('u') } } })
    await run(root)
    fs.rmSync(j(root, '.claude', 'skills', 'u'), { recursive: true })
    fs.rmSync(j(root, 'node_modules', 'p'), { recursive: true })
    const { result } = await run(root)
    expect(result.actions).toEqual([{ kind: 'removed', skill: 's', package: 'p', detail: '.claude/skills' }])
    expect(fs.readdirSync(j(root, '.claude', 'skills'))).toEqual([])
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test("a hand-made link into a package under another name is left alone until the package no longer provides the skill", async () => {
    const root = makeProject({ node_modules: { p: skillPkg('p', 's') }, '.agents': { skills: { u: skillDir('u') } } })
    fs.symlinkSync('../../node_modules/p/skills/s', j(root, '.agents', 'skills', 'my-alias'), 'dir')
    const first = await run(root)
    expect(first.result.actions).toEqual([{ kind: 'added', skill: 's', package: 'p', detail: '.agents/skills' }])
    expect(linkTarget(j(root, '.agents', 'skills', 'my-alias'))).toBe('../../node_modules/p/skills/s')

    fs.rmSync(j(root, 'node_modules', 'p'), { recursive: true })
    const second = await run(root)
    expect(second.result.actions.map((a) => [a.kind, a.skill])).toEqual([
      ['removed', 'my-alias'],
      ['removed', 's'],
    ])
    expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['u'])
  })
})

describe('copy mode', () => {
  describe('tamper protection', () => {
    test('a locally-modified skill is left untouched: warning + non-zero exit', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      const skillMdPath = j(root, '.agents', 'skills', 's', 'SKILL.md')
      fs.appendFileSync(skillMdPath, '\nmy local tweak\n')

      const { result, log } = await run(root)
      expect(result.exitCode).toBe(1)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'tampered', skill: 's' }))
      expect(read(skillMdPath)).toContain('my local tweak')
      expect(log.warnings.join('\n')).toContain(
        'skill `s` was modified locally — to keep your changes, remove `p` or add it to `"exclude"` in ' +
          '`.use-npm-skills.json`; or run `npx use-npm-skills --force` to override your changes',
      )
    })

    test('an added file also counts as a local modification', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.writeFileSync(j(root, '.agents', 'skills', 's', 'notes.md'), 'mine')
      const { result } = await run(root)
      expect(result.exitCode).toBe(1)
      expect(exists(j(root, '.agents', 'skills', 's', 'notes.md'))).toBe(true)
    })

    test('CRLF line endings (core.autocrlf) do not count as a modification', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      const skillMdPath = j(root, '.agents', 'skills', 's', 'SKILL.md')
      fs.writeFileSync(skillMdPath, read(skillMdPath).replaceAll('\n', '\r\n'))
      const { result } = await run(root)
      expect(result.exitCode).toBe(0)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'up-to-date', skill: 's' }))
    })

    test('--force (non-TTY): lists the modified skills and overwrites them', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'tweak')

      const listed: string[] = []
      const { result, log } = await run(root, {
        force: true,
        onTamperedList: (tampered) => listed.push(...tampered.map((t) => t.skill)),
      })
      expect(listed).toEqual(['s'])
      expect(result.exitCode).toBe(0)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'forced', skill: 's' }))
      expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toBe(skillMd('s'))
      expect(log.infos.join('\n')).toMatch(/consider removing `p` — or adding it to `exclude`/)
    })

    test('--force with a declined confirmation keeps the changes, exit 0', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'tweak')

      const { result } = await run(root, { force: true, confirmOverwrite: () => false })
      expect(result.exitCode).toBe(0)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'kept', skill: 's' }))
      expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('tweak')
    })

    test('other skills still sync when one is tampered', async () => {
      const root = makeProject({
        ...copyMode,
        node_modules: { p1: skillPkg('p1', 's1'), p2: skillPkg('p2', 's2') },
      })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's1', 'SKILL.md'), 'tweak')
      fs.writeFileSync(j(root, 'node_modules', 'p2', 'skills', 's2', 'SKILL.md'), skillMd('s2', 'v2'))
      const { result } = await run(root)
      expect(result.exitCode).toBe(1)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'tampered', skill: 's1' }))
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated', skill: 's2' }))
      expect(read(j(root, '.agents', 'skills', 's2', 'SKILL.md'))).toContain('v2')
    })
  })

  describe('switching to symlink mode', () => {
    test('a modified copy is left untouched (tamper protection), a pristine one replaced by a link', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's'), q: skillPkg('q', 't') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'tweak')
      fs.rmSync(j(root, '.use-npm-skills.json'))

      const { result } = await run(root)
      expect(result.exitCode).toBe(1)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'tampered', skill: 's' }))
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated', skill: 't' }))
      expect(isLink(j(root, '.agents', 'skills', 's'))).toBe(false)
      expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('tweak')
      expect(linkTarget(j(root, '.agents', 'skills', 't'))).toBe('../../node_modules/q/skills/t')
    })

    test('--force replaces the modified copy by a link', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'tweak')
      fs.rmSync(j(root, '.use-npm-skills.json'))

      const { result } = await run(root, { force: true })
      expect(result.exitCode).toBe(0)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'forced', skill: 's' }))
      expect(linkTarget(j(root, '.agents', 'skills', 's'))).toBe('../../node_modules/p/skills/s')
    })
  })

  describe('pruning', () => {
    test('a pristine orphan is deleted together with its mirror symlinks', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') }, ...twoTargets })
      await run(root)
      expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(true)

      fs.rmSync(j(root, 'node_modules', 'p'), { recursive: true })
      const { result } = await run(root)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'removed', skill: 's' }))
      expect(exists(j(root, '.agents', 'skills', 's'))).toBe(false)
      expect(fs.readdirSync(j(root, '.claude', 'skills'))).toEqual(['u2'])
    })

    test('a modified orphan is adopted: source.json removed, files kept', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'my tweak')

      fs.rmSync(j(root, 'node_modules', 'p'), { recursive: true })
      const { result } = await run(root)
      expect(result.exitCode).toBe(0)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'adopted', skill: 's' }))
      expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('my tweak')
      expect(exists(j(root, '.agents', 'skills', 's', 'source.json'))).toBe(false)
    })

    test('an adopted skill then blocks re-materialization if the package comes back', async () => {
      const root = makeProject({ ...copyMode, node_modules: { p: skillPkg('p', 's') } })
      await run(root)
      fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'my tweak')
      const packageDir = j(root, 'node_modules', 'p')
      const saved = j(root, 'p-saved')
      fs.renameSync(packageDir, saved)
      await run(root) // adopts
      fs.renameSync(saved, packageDir)

      const { result } = await run(root)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'skipped-user-owned', skill: 's' }))
      expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('my tweak')
    })

    test('a skill dropped by a new version of its package is removed, its siblings updated', async () => {
      const root = makeProject({
        ...copyMode,
        node_modules: { lib: { 'package.json': pkgJson('lib', '1.0.0'), skills: { a: skillDir('a'), b: skillDir('b') } } },
      })
      await run(root)
      expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['a', 'b'])

      makeTree(j(root, 'node_modules'), { lib: { 'package.json': pkgJson('lib', '2.0.0') } })
      fs.rmSync(j(root, 'node_modules', 'lib', 'skills', 'b'), { recursive: true })
      const { result } = await run(root)
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated', skill: 'a', package: 'lib' }))
      expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'removed', skill: 'b', package: 'lib' }))
      expect(fs.readdirSync(j(root, '.agents', 'skills'))).toEqual(['a'])
      expect(readSource(j(root, '.agents', 'skills', 'a')).version).toBe('2.0.0')
    })
  })
})
