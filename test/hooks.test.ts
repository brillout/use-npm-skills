import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { installPackage, uninstallPackage } from '../src/hooks.js'
import { Logger } from '../src/logger.js'
import { UsageError } from '../src/types.js'
import { exists, isLink, j, makeProject, makeTree, read, readSource, run, skillDir, skillMd, skillPkg } from './helpers.js'

async function install(cwd: string, ci = false) {
  const log = new Logger(true)
  const result = await installPackage({ cwd, ci, platform: 'linux', log })
  return { result, log }
}

function uninstall(cwd: string) {
  const log = new Logger(true)
  const result = uninstallPackage({ cwd, platform: 'linux', log })
  return { result, log }
}

describe('install-package', () => {
  test('installs the skills of its package only, and reports the others as missing', async () => {
    const root = makeProject({ node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') } })
    const { result, log } = await install(j(root, 'node_modules', 'a'))
    expect(result.root).toBe(root)
    expect(result.actions).toMatchObject([{ kind: 'added', skill: 'sa', package: 'a' }])
    expect(exists(j(root, '.agents', 'skills', 'sa', 'SKILL.md'))).toBe(true)
    expect(exists(j(root, '.agents', 'skills', 'sb'))).toBe(false)
    expect(result.problems).toEqual(['skill `sb` of `b` is missing'])
    expect(log.errors.join('\n')).toMatch(/run `npx use-npm-skills`/)
    expect(result.exitCode).toBe(0) // never fails a local install
  })

  test('a bad state fails the command under CI only', async () => {
    const root = makeProject({ node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') } })
    expect((await install(j(root, 'node_modules', 'a'), true)).result.exitCode).toBe(1)
    await run(root) // now everything is in sync
    const { result } = await install(j(root, 'node_modules', 'a'), true)
    expect(result.problems).toEqual([])
    expect(result.exitCode).toBe(0)
  })

  test('reports an outdated skill of another package without touching it', async () => {
    const root = makeProject({ node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb', '1.0.0') } })
    await run(root)
    makeTree(j(root, 'node_modules'), { b: skillPkg('b', 'sb', '2.0.0', { 'SKILL.md': skillMd('sb', 'v2') }) })
    const { result } = await install(j(root, 'node_modules', 'a'))
    expect(result.actions).toMatchObject([{ kind: 'up-to-date', skill: 'sa' }])
    expect(result.problems).toEqual(['skill `sb` of `b` is outdated'])
    expect(readSource(j(root, '.agents', 'skills', 'sb')).version).toBe('1.0.0')
  })

  test('reports a skill left over from an uninstalled package without removing it', async () => {
    const root = makeProject({ node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') } })
    await run(root)
    fs.rmSync(j(root, 'node_modules', 'b'), { recursive: true })
    const { result } = await install(j(root, 'node_modules', 'a'))
    expect(result.problems).toEqual(['skill `sb` in .agents/skills is left over from `b`, which no longer provides it'])
    expect(exists(j(root, '.agents', 'skills', 'sb', 'SKILL.md'))).toBe(true)
  })

  test("reports another package's locally modified skill, and its own", async () => {
    const root = makeProject({ node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') } })
    await run(root)
    fs.appendFileSync(j(root, '.agents', 'skills', 'sa', 'SKILL.md'), 'tweak')
    fs.appendFileSync(j(root, '.agents', 'skills', 'sb', 'SKILL.md'), 'tweak')
    const { result } = await install(j(root, 'node_modules', 'a'))
    expect(result.actions).toMatchObject([{ kind: 'tampered', skill: 'sa' }])
    expect(result.problems).toEqual(['skill `sb` of `b` is modified locally', 'skill `sa` of `a` was modified locally'])
    expect(read(j(root, '.agents', 'skills', 'sa', 'SKILL.md'))).toContain('tweak')
  })

  test('a missing mirror symlink is a bad state', async () => {
    const root = makeProject({
      node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') },
      '.agents': { skills: { u1: skillDir('u1') } },
      '.claude': { skills: { u2: skillDir('u2') } },
    })
    await run(root)
    fs.unlinkSync(j(root, '.claude', 'skills', 'sb'))
    const { result } = await install(j(root, 'node_modules', 'a'))
    expect(result.problems).toEqual(['skill `sb` of `b` is missing'])
  })

  test('user-authored content in the way, excluded packages, and collision losers are not bad states', async () => {
    const root = makeProject({
      node_modules: {
        a: skillPkg('a', 'sa'),
        b: skillPkg('b', 'sb'),
        c: skillPkg('c', 'shared'),
        d: skillPkg('d', 'shared'), // loses the name collision to c
        e: skillPkg('e', 'se'),
      },
      '.agents': { skills: { sb: skillDir('sb') } }, // user-authored: blocks b's skill
      '.use-npm-skills.json': JSON.stringify({ exclude: ['e'] }),
    })
    await run(root)
    const { result } = await install(j(root, 'node_modules', 'a'))
    expect(result.problems).toEqual([])
  })

  test('an excluded package installs nothing but still checks the others', async () => {
    const root = makeProject({
      node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') },
      '.use-npm-skills.json': JSON.stringify({ exclude: ['a'] }),
    })
    const { result } = await install(j(root, 'node_modules', 'a'))
    expect(result.actions).toMatchObject([{ kind: 'excluded', skill: 'sa', package: 'a' }])
    expect(exists(j(root, '.agents', 'skills', 'sa'))).toBe(false)
    expect(result.problems).toEqual(['skill `sb` of `b` is missing'])
  })

  test("works from pnpm's virtual store, the package being linked into node_modules/ by then", async () => {
    const root = makeProject({
      node_modules: { '.pnpm': { 'a@1.0.0': { node_modules: { a: skillPkg('a', 'sa') } } } },
    })
    fs.symlinkSync(j('.pnpm', 'a@1.0.0', 'node_modules', 'a'), j(root, 'node_modules', 'a'))
    const { result } = await install(j(root, 'node_modules', '.pnpm', 'a@1.0.0', 'node_modules', 'a'))
    expect(result.root).toBe(root)
    expect(result.actions).toMatchObject([{ kind: 'added', skill: 'sa', package: 'a' }])
    expect(exists(j(root, '.agents', 'skills', 'sa', 'SKILL.md'))).toBe(true)
  })

  test("installs nothing for a package the crawl doesn't see: a transitive dependency pnpm keeps out of node_modules/", async () => {
    const root = makeProject({
      node_modules: { b: skillPkg('b', 'sb'), '.pnpm': { 'a@1.0.0': { node_modules: { a: skillPkg('a', 'sa') } } } },
    })
    const { result, log } = await install(j(root, 'node_modules', '.pnpm', 'a@1.0.0', 'node_modules', 'a'))
    expect(result.actions).toEqual([])
    expect(exists(j(root, '.agents', 'skills', 'sa'))).toBe(false)
    expect(log.infos.join('\n')).toMatch(/`a` is not among the skill packages installed in/)
    expect(result.problems).toEqual(['skill `sb` of `b` is missing']) // the check still runs
  })

  test("installs nothing in the package's own repository, whose npm install runs its postinstall too", async () => {
    const root = makeProject({ ...skillPkg('a', 'sa'), node_modules: { 'not-a-skill-package': { 'package.json': '{}' } } })
    const { result } = await install(root)
    expect(result.root).toBe(root)
    expect(result.actions).toEqual([])
    expect(exists(j(root, '.agents'))).toBe(false)
  })

  test('a working directory without a package.json is a usage error', async () => {
    const root = makeProject({ node_modules: {} })
    await expect(install(j(root, 'node_modules'))).rejects.toThrow(UsageError)
  })
})

describe('uninstall-package', () => {
  test('removes the pristine skills of its package, mirror symlinks included, and nothing else', async () => {
    const root = makeProject({
      node_modules: { a: skillPkg('a', 'sa'), b: skillPkg('b', 'sb') },
      '.agents': { skills: { u1: skillDir('u1') } },
      '.claude': { skills: { u2: skillDir('u2') } },
    })
    await run(root)
    expect(isLink(j(root, '.claude', 'skills', 'sa'))).toBe(true)
    const { result } = uninstall(j(root, 'node_modules', 'a'))
    expect(result.actions).toMatchObject([{ kind: 'removed', skill: 'sa', package: 'a' }])
    expect(fs.readdirSync(j(root, '.agents', 'skills')).sort()).toEqual(['sb', 'u1'])
    expect(fs.readdirSync(j(root, '.claude', 'skills')).sort()).toEqual(['sb', 'u2'])
    expect(isLink(j(root, '.claude', 'skills', 'sb'))).toBe(true)
  })

  test('adopts a locally modified skill instead of deleting it', async () => {
    const root = makeProject({ node_modules: { a: skillPkg('a', 'sa') } })
    await run(root)
    fs.appendFileSync(j(root, '.agents', 'skills', 'sa', 'SKILL.md'), 'tweak')
    const { result } = uninstall(j(root, 'node_modules', 'a'))
    expect(result.actions).toMatchObject([{ kind: 'adopted', skill: 'sa' }])
    expect(read(j(root, '.agents', 'skills', 'sa', 'SKILL.md'))).toContain('tweak')
    expect(exists(j(root, '.agents', 'skills', 'sa', 'source.json'))).toBe(false)
  })
})
