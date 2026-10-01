import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { detectGitSymlinkSupport } from '../src/gitSymlinks.js'
import { hashFileMap } from '../src/hash.js'
import { readPackageLink } from '../src/packageLink.js'

describe('detectGitSymlinkSupport', () => {
  // Hermetic: point Git's global/system config at a nonexistent file so only
  // the throwaway repo's local config decides.
  beforeAll(() => {
    const noConfig = path.join(os.tmpdir(), 'use-npm-skills-no-gitconfig')
    vi.stubEnv('GIT_CONFIG_GLOBAL', noConfig)
    vi.stubEnv('GIT_CONFIG_SYSTEM', noConfig)
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  const gitRepo = (coreSymlinks?: 'true' | 'false') => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'use-npm-skills-git-')))
    execFileSync('git', ['init', '-q'], { cwd: root })
    if (coreSymlinks) execFileSync('git', ['config', 'core.symlinks', coreSymlinks], { cwd: root })
    return root
  }

  test('unavailable when core.symlinks is disabled', () => {
    expect(detectGitSymlinkSupport(gitRepo('false'))).toBe(false)
  })
  test('unavailable when core.symlinks is unset', () => {
    expect(detectGitSymlinkSupport(gitRepo())).toBe(false)
  })
  // On Windows the probe legitimately depends on the machine (Developer Mode).
  test.skipIf(process.platform === 'win32')('available when core.symlinks is enabled and symlinks can be created', () => {
    expect(detectGitSymlinkSupport(gitRepo('true'))).toBe(true)
  })
})

describe('readPackageLink', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'use-npm-skills-links-')))
  const link = (name: string, target: string) => {
    const linkPath = path.join(dir, name)
    fs.symlinkSync(target, linkPath, 'dir')
    return linkPath
  }

  test('a symlink into a package’s skills/ is a package link — dangling or not', () => {
    fs.mkdirSync(path.join(dir, 'node_modules', 'p', 'skills', 's'), { recursive: true })
    expect(readPackageLink(link('resolving', 'node_modules/p/skills/s'))).toEqual({
      package: 'p',
      skill: 's',
      target: path.join(dir, 'node_modules', 'p', 'skills', 's'),
    })
    expect(readPackageLink(link('dangling', '../elsewhere/node_modules/gone/skills/old'))).toMatchObject({
      package: 'gone',
      skill: 'old',
    })
  })

  test('scoped packages and pnpm’s versioned store paths are recognized too', () => {
    expect(readPackageLink(link('scoped', 'node_modules/@scope/p/skills/s'))).toMatchObject({
      package: '@scope/p',
      skill: 's',
    })
    expect(readPackageLink(link('pnpm', 'node_modules/.pnpm/p@1.0.0/node_modules/p/skills/s'))).toMatchObject({
      package: 'p',
      skill: 's',
    })
  })

  test('anything else is not a package link', () => {
    expect(readPackageLink(link('sibling-dir', '../.agents/skills/s'))).toBeNull()
    expect(readPackageLink(link('package-root', 'node_modules/p'))).toBeNull()
    expect(readPackageLink(link('skills-dir', 'node_modules/p/skills'))).toBeNull()
    expect(readPackageLink(link('too-deep', 'node_modules/p/skills/s/sub'))).toBeNull()
    expect(readPackageLink(link('other-layout', 'node_modules/p/skill/s'))).toBeNull()
    expect(readPackageLink(path.join(dir, 'node_modules', 'p', 'skills', 's'))).toBeNull() // a real dir
    expect(readPackageLink(path.join(dir, 'missing'))).toBeNull()
  })
})

describe('hashFileMap', () => {
  test('is order-independent', () => {
    const a = new Map([
      ['a.md', Buffer.from('one')],
      ['b.md', Buffer.from('two')],
    ])
    const b = new Map([
      ['b.md', Buffer.from('two')],
      ['a.md', Buffer.from('one')],
    ])
    expect(hashFileMap(a)).toBe(hashFileMap(b))
  })
  test('normalizes CRLF to LF for text files', () => {
    const lf = new Map([['a.md', Buffer.from('line one\nline two\n')]])
    const crlf = new Map([['a.md', Buffer.from('line one\r\nline two\r\n')]])
    expect(hashFileMap(lf)).toBe(hashFileMap(crlf))
  })
  test('leaves binary content untouched', () => {
    const a = new Map([['bin', Buffer.from([0, 13, 10, 1])]])
    const b = new Map([['bin', Buffer.from([0, 10, 1])]])
    expect(hashFileMap(a)).not.toBe(hashFileMap(b))
  })
  test('distinguishes paths from content', () => {
    const a = new Map([['a', Buffer.from('bc')]])
    const b = new Map([['ab', Buffer.from('c')]])
    expect(hashFileMap(a)).not.toBe(hashFileMap(b))
  })
})
