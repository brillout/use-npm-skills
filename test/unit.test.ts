import { describe, expect, test } from 'vitest'
import { isValidSkillName, parseFrontmatterName } from '../src/frontmatter.js'
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
