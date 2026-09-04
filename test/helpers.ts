import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Logger } from '../src/logger.js'
import { sync, type SyncOptions } from '../src/sync.js'

export type Tree = { [name: string]: Tree | string | Buffer }

export function makeTree(dir: string, tree: Tree): void {
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, value] of Object.entries(tree)) {
    const target = path.join(dir, name)
    if (typeof value === 'string' || Buffer.isBuffer(value)) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, value)
    } else {
      makeTree(target, value)
    }
  }
}

/** A temp Git repository root (a bare `.git` entry marks it). */
export function makeProject(tree: Tree = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'use-npm-skills-test-'))
  makeTree(root, { '.git': {}, ...tree })
  return fs.realpathSync(root)
}

export function pkgJson(name: string, version = '1.0.0'): string {
  return JSON.stringify({ name, version }, null, 2)
}

export function skillMd(name: string, body = ''): string {
  return `---\nname: ${name}\ndescription: A test skill.\n---\n\n# ${name}\n${body}`
}

/** The subtree of one skill directory: a SKILL.md named `skillName` plus `files`. */
export function skillDir(skillName: string, files: Tree = {}): Tree {
  return { 'SKILL.md': skillMd(skillName), ...files }
}

/** node_modules subtree for a skill package shipping one skill, in skills/<skillName>/ (a SKILL.md plus `files`). */
export function skillPkg(name: string, skillName: string, version = '1.0.0', files: Tree = {}): Tree {
  return { 'package.json': pkgJson(name, version), skills: { [skillName]: skillDir(skillName, files) } }
}

/**
 * Install (or update) a package the way pnpm lays it out: the package lives in
 * the versioned virtual store, and the top-level node_modules/<name> entry is
 * a symlink to it.
 */
export function pnpmInstall(root: string, name: string, version: string, tree: Tree): void {
  makeTree(path.join(root, 'node_modules', '.pnpm', `${name}@${version}`, 'node_modules', name), tree)
  const link = path.join(root, 'node_modules', name)
  fs.rmSync(link, { force: true })
  fs.symlinkSync(path.join('.pnpm', `${name}@${version}`, 'node_modules', name), link, 'dir')
}

/** Config opting into copy mode (symlink mode is the default). */
export const copyMode: Tree = { '.use-npm-skills.json': JSON.stringify({ mode: 'copy' }) }

/** Two skills dirs, each already holding a user-authored skill so that both qualify as targets. */
export const twoTargets: Tree = {
  '.agents': { skills: { u1: skillDir('u1') } },
  '.claude': { skills: { u2: skillDir('u2') } },
}

export async function run(root: string, options: Partial<SyncOptions> = {}) {
  const log = new Logger(true)
  const result = await sync({ cwd: root, platform: 'linux', log, ...options })
  return { result, log }
}

export const exists = (p: string) => fs.existsSync(p)
export const isLink = (p: string) => fs.lstatSync(p).isSymbolicLink()
export const linkTarget = (p: string) => fs.readlinkSync(p)
export const read = (p: string) => fs.readFileSync(p, 'utf8')
export const readSource = (skillDir: string) => JSON.parse(read(path.join(skillDir, 'source.json')))
export const j = path.join
