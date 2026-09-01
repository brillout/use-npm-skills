import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { SOURCE_JSON, type SkillFile } from './types.js'

const HASH_PREFIX = 'sha256:'

/**
 * CRLF → LF, so `core.autocrlf` checkouts don't make every skill look locally
 * modified on Windows. Buffers containing a NUL byte are treated as binary and
 * left untouched.
 */
export function normalizeContent(content: Buffer): Buffer {
  if (content.includes(0)) return content
  const text = content.toString('utf8')
  const normalized = text.replaceAll('\r\n', '\n')
  return normalized === text ? content : Buffer.from(normalized, 'utf8')
}

/**
 * Deterministic hash of a { relativePath → file } map. Covers contents only,
 * never file modes — Windows checkouts have no POSIX modes, and a `chmod` is
 * not a user edit.
 */
export function hashFileMap(files: Map<string, SkillFile>): string {
  const h = createHash('sha256')
  for (const rel of [...files.keys()].sort()) {
    h.update(rel)
    h.update('\0')
    h.update(normalizeContent(files.get(rel)!.content))
    h.update('\0')
  }
  return HASH_PREFIX + h.digest('hex')
}

/**
 * Read all files under dir into a { relativePath → content } map (POSIX
 * separators). Symlinks are followed; a dangling one throws — callers treat
 * that as "modified".
 */
export function readDirFiles(dir: string, opts?: { excludeRootSourceJson?: boolean }): Map<string, SkillFile> {
  const files = new Map<string, SkillFile>()
  const walk = (d: string, relBase: string) => {
    for (const name of fs.readdirSync(d)) {
      if (relBase === '' && opts?.excludeRootSourceJson && name === SOURCE_JSON) continue
      const abs = path.join(d, name)
      const rel = relBase === '' ? name : `${relBase}/${name}`
      const stat = fs.statSync(abs) // follows symlinks; throws on dangling ones
      if (stat.isDirectory()) walk(abs, rel)
      else if (stat.isFile()) files.set(rel, { content: fs.readFileSync(abs), executable: (stat.mode & 0o111) !== 0 })
    }
  }
  walk(dir, '')
  return files
}

/** Hash of a materialized skill dir — source.json excluded. */
export function hashSkillDir(dir: string): string {
  return hashFileMap(readDirFiles(dir, { excludeRootSourceJson: true }))
}
