export const CONFIG_FILE = '.use-npm-skills.json'
export const SOURCE_JSON = 'source.json'
export const DEFAULT_SKILLS_DIR = '.agents/skills'

/**
 * How a skill is materialized: as a symlink into the package (the default) or
 * as a copy of its files.
 */
export type Mode = 'symlink' | 'copy'
export const DEFAULT_MODE: Mode = 'symlink'

/** A skill shipped by an installed skill package: one subdirectory of the package's skills/ directory. */
export interface PackageSkill {
  /** The skill's name: its directory name under skills/, and its materialized directory name. */
  name: string
  /**
   * Absolute path of the skill's directory inside the package, through the
   * package's top-level `node_modules/<package>/` entry — never resolved
   * through package-manager symlinks (pnpm's versioned `node_modules/.pnpm/…`
   * store), so the path is stable across updates and safe to symlink to.
   */
  dir: string
  /** npm name of the package shipping the skill. */
  package: string
  /** That package's version. */
  version: string
}

/** Contents of a copied skill's source.json. */
export interface SourceMeta {
  package: string
  version: string
  hash: string
}

export interface Config {
  mode?: Mode
  skillsDirs?: string[]
  exclude?: string[]
}

/** Copy mode: how the physical skills dirs mirror each other. */
export type MirrorStyle = 'symlink' | 'copy'

/** The layout skills are materialized in — the analysis step's decision. */
export type Analysis =
  | {
      mode: 'symlink'
      /** Absolute paths of the physical skills dirs (dir-level symlinks collapsed); each gets a package link per skill. */
      physicalDirs: string[]
    }
  | {
      mode: 'copy'
      /** Absolute paths of the physical skills dirs (dir-level symlinks collapsed). */
      physicalDirs: string[]
      /** Per-skill relative symlinks to the primary dir, or independent copies in every physical dir. */
      style: MirrorStyle
      /** Absolute path of the dir that holds the real files under the symlink mirror style. */
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
