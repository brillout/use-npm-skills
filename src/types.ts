export const KEYWORD = 'use-npm-skills'
export const CONFIG_FILE = '.use-npm-skills.json'
export const SOURCE_JSON = 'source.json'
export const DEFAULT_SKILLS_DIR = '.agents/skills'

/** A skill shipped by an installed skill package: one subdirectory of the package's skills/ directory. */
export interface PackageSkill {
  /**
   * The skill's name: its directory name under skills/ (matched by its frontmatter `name`),
   * and its materialized directory name.
   */
  name: string
  /** Absolute path of the skill's directory inside the package (through pnpm symlinks). */
  dir: string
  /** npm name of the package shipping the skill. */
  package: string
  /** That package's version. */
  version: string
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
