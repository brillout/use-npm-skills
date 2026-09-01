export const KEYWORD = 'use-npm-skills'
export const CONFIG_FILE = '.use-npm-skills.json'
export const SOURCE_JSON = 'source.json'
export const DEFAULT_SKILLS_DIR = '.agents/skills'

/** An installed npm package that ships a skill (in its skill/ directory). */
export interface SkillPackage {
  /** npm package name */
  name: string
  version: string
  /** Absolute path of the package inside node_modules (through pnpm symlinks). */
  dir: string
  /** The skill's frontmatter `name` — also the materialized directory name. */
  skillName: string
}

/** A skill file as read from its package: content plus the executable bit to preserve on the materialized copy. */
export interface SkillFile {
  content: Buffer
  executable: boolean
}

/** Contents of a materialized skill's source.json. */
export interface SourceMeta {
  package: string
  version: string
  hash: string
}

export interface Config {
  skillsDirs?: string[]
  exclude?: string[]
}

export type MirrorStyle = 'symlink' | 'copy'

export interface Analysis {
  /** Absolute paths of the physical skills dirs (dir-level symlinks collapsed). */
  physicalDirs: string[]
  style: MirrorStyle
  /** Absolute path of the dir that holds real files under the symlink style. */
  primaryDir: string
}

export type ActionKind =
  | 'added'
  | 'updated'
  | 'up-to-date'
  | 'forced'
  | 'kept' // --force, but the user declined overwriting this skill
  | 'tampered' // modified locally, no --force ⇒ left untouched, exit non-zero
  | 'skipped-user-owned'
  | 'skipped-collision'
  | 'excluded'
  | 'removed'
  | 'adopted'

export interface Action {
  kind: ActionKind
  skill: string
  package: string
  detail?: string
}

export interface SyncResult {
  root: string
  /** Absolute paths of the target skills dirs (before collapsing dir-level symlinks). */
  targetDirs: string[]
  analysis: Analysis | null
  actions: Action[]
  warnings: string[]
  exitCode: number
}

/** Error caused by the environment/usage — reported without a stack trace. */
export class UsageError extends Error {}
