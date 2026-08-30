import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { exists, isLink, j, makeProject, read, readSource, run, skillMd, skillPkgFile } from './helpers.js'

const twoTargets = {
  '.agents': { skills: { u1: { 'SKILL.md': skillMd('u1') } } },
  '.claude': { skills: { u2: { 'SKILL.md': skillMd('u2') } } },
}

describe('tamper protection', () => {
  test('a locally-modified skill is left untouched: warning + non-zero exit', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
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
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
    await run(root)
    fs.writeFileSync(j(root, '.agents', 'skills', 's', 'notes.md'), 'mine')
    const { result } = await run(root)
    expect(result.exitCode).toBe(1)
    expect(exists(j(root, '.agents', 'skills', 's', 'notes.md'))).toBe(true)
  })

  test('CRLF line endings (core.autocrlf) do not count as a modification', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
    await run(root)
    const skillMdPath = j(root, '.agents', 'skills', 's', 'SKILL.md')
    fs.writeFileSync(skillMdPath, read(skillMdPath).replaceAll('\n', '\r\n'))
    const { result } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'up-to-date', skill: 's' }))
  })

  test('--force (non-TTY): lists the modified skills and overwrites them', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
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
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
    await run(root)
    fs.appendFileSync(j(root, '.agents', 'skills', 's', 'SKILL.md'), 'tweak')

    const { result } = await run(root, { force: true, confirmOverwrite: () => false })
    expect(result.exitCode).toBe(0)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'kept', skill: 's' }))
    expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('tweak')
  })

  test('other skills still sync when one is tampered', async () => {
    const root = makeProject({
      node_modules: { p1: skillPkgFile('p1', 's1'), p2: skillPkgFile('p2', 's2') },
    })
    await run(root)
    fs.appendFileSync(j(root, '.agents', 'skills', 's1', 'SKILL.md'), 'tweak')
    makeTreeUpdate(root)
    const { result } = await run(root)
    expect(result.exitCode).toBe(1)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'tampered', skill: 's1' }))
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'updated', skill: 's2' }))
    expect(read(j(root, '.agents', 'skills', 's2', 'SKILL.md'))).toContain('v2')
  })
})

function makeTreeUpdate(root: string) {
  fs.writeFileSync(j(root, 'node_modules', 'p2', 'SKILL.md'), skillMd('s2', 'v2'))
}

describe('user-authored skills always win', () => {
  test('an existing skill without source.json is never touched', async () => {
    const root = makeProject({
      node_modules: { p: skillPkgFile('p', 's') },
      '.agents': { skills: { s: { 'SKILL.md': skillMd('s', 'hand-written') } } },
    })
    const { result, log } = await run(root)
    expect(result.exitCode).toBe(0)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'skipped-user-owned', skill: 's' }))
    expect(read(j(root, '.agents', 'skills', 's', 'SKILL.md'))).toContain('hand-written')
    expect(exists(j(root, '.agents', 'skills', 's', 'source.json'))).toBe(false)
    expect(log.warnings.join('\n')).toMatch(/user-authored/)
  })
})

describe('pruning', () => {
  test('a pristine orphan is deleted together with its mirror symlinks', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') }, ...twoTargets })
    await run(root)
    expect(isLink(j(root, '.claude', 'skills', 's'))).toBe(true)

    fs.rmSync(j(root, 'node_modules', 'p'), { recursive: true })
    const { result } = await run(root)
    expect(result.actions).toContainEqual(expect.objectContaining({ kind: 'removed', skill: 's' }))
    expect(exists(j(root, '.agents', 'skills', 's'))).toBe(false)
    expect(fs.readdirSync(j(root, '.claude', 'skills'))).toEqual(['u2'])
  })

  test('a modified orphan is adopted: source.json removed, files kept', async () => {
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
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
    const root = makeProject({ node_modules: { p: skillPkgFile('p', 's') } })
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
})
