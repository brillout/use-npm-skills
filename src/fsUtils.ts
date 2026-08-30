import fs from 'node:fs'
import path from 'node:path'

export type PathType = 'dir' | 'file' | 'symlink' | 'missing'

export function lstatType(p: string): PathType {
  try {
    const s = fs.lstatSync(p)
    if (s.isSymbolicLink()) return 'symlink'
    if (s.isDirectory()) return 'dir'
    return 'file'
  } catch {
    return 'missing'
  }
}

export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

export function realpathSafe(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

export function readdirSafe(p: string): string[] {
  try {
    return fs.readdirSync(p)
  } catch {
    return []
  }
}

/** Resolve a symlink one hop, without requiring the target to exist. */
export function resolveLinkTarget(linkPath: string): string | null {
  try {
    return path.resolve(path.dirname(linkPath), fs.readlinkSync(linkPath))
  } catch {
    return null
  }
}

export function readJsonSafe(p: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true })
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

/** Path relative to the project root, POSIX separators — for messages. */
export function relDisplay(root: string, p: string): string {
  return toPosix(path.relative(root, p)) || '.'
}

/** Write a { relativePath → content } map into dir, creating parent dirs. */
export function writeFileMap(dir: string, files: Map<string, Buffer>): void {
  for (const [rel, content] of files) {
    const abs = path.join(dir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
}
