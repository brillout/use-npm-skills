import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { isValidSkillName, parseFrontmatterName } from '../src/frontmatter.js'
import { detectGitSymlinkSupport } from '../src/gitSymlinks.js'
import { hashFileMap } from '../src/hash.js'

describe('parseFrontmatterName', () => {
  test('basic', () => {
    expect(parseFrontmatterName('---\nname: my-skill\ndescription: x\n---\n# Hi')).toBe('my-skill')
  })
  test('quoted values', () => {
    expect(parseFrontmatterName('---\nname: "my-skill"\n---\n')).toBe('my-skill')
    expect(parseFrontmatterName("---\nname: 'my-skill'\n---\n")).toBe('my-skill')
  })
  test('BOM and CRLF', () => {
    expect(parseFrontmatterName('\uFEFF---\r\nname: my-skill\r\n---\r\nbody')).toBe('my-skill')
  })
  test('frontmatter at EOF without trailing newline', () => {
    expect(parseFrontmatterName('---\nname: my-skill\n---')).toBe('my-skill')
  })
  test('no frontmatter', () => {
    expect(parseFrontmatterName('# Just a title\nname: nope')).toBe(null)
  })
  test('frontmatter without name', () => {
    expect(parseFrontmatterName('---\ndescription: x\n---\n')).toBe(null)
  })
  test('does not match indented or nested name keys', () => {
    expect(parseFrontmatterName('---\nmeta:\n  name: nested\n---\n')).toBe(null)
  })
})

describe('isValidSkillName', () => {
  test('accepts spec names', () => {
    expect(isValidSkillName('my-skill')).toBe(true)
    expect(isValidSkillName('a')).toBe(true)
    expect(isValidSkillName('skill2')).toBe(true)
  })
  test('rejects invalid names', () => {
    expect(isValidSkillName('My-Skill')).toBe(false)
    expect(isValidSkillName('-skill')).toBe(false)
    expect(isValidSkillName('skill-')).toBe(false)
    expect(isValidSkillName('a/b')).toBe(false)
    expect(isValidSkillName('..')).toBe(false)
    expect(isValidSkillName('')).toBe(false)
    expect(isValidSkillName('x'.repeat(65))).toBe(false)
  })
})

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
