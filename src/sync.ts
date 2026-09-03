import path from 'node:path'
import { analyzeStructure } from './analyze.js'
import { loadConfig } from './config.js'
import { enumerateSkills } from './enumerate.js'
import { isFile, relDisplay } from './fsUtils.js'
import { Logger } from './logger.js'
import { listTampered, materializeAll } from './materialize.js'
import { pruneOrphans } from './prune.js'
import { resolveProjectRoot } from './resolveRoot.js'
import { discoverTargetDirs } from './targets.js'
import { CONFIG_FILE, UsageError, type Action, type SyncResult } from './types.js'

export interface SyncOptions {
  cwd?: string
  force?: boolean
  /** For tests — defaults to process.platform (on Windows the default mirror style depends on Git symlink support). */
  platform?: NodeJS.Platform
  /** For tests — is Git symlink support available at the project root? Defaults to detecting it (consulted on Windows only). */
  gitSymlinks?: (root: string) => boolean
  log?: Logger
  /** Called per locally-modified skill when --force is set. Default: overwrite (the non-TTY behavior). */
  confirmOverwrite?: (skillName: string, pkgName: string) => Promise<boolean> | boolean
  /** Called with the list of locally-modified skills before any confirm (--force only). */
  onTamperedList?: (tampered: { skill: string; package: string }[]) => void
}

export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const log = options.log ?? new Logger()
  const platform = options.platform ?? process.platform
  const force = options.force ?? false
  const cwd = path.resolve(options.cwd ?? process.cwd())

  const root = resolveProjectRoot(cwd)
  if (!root) {
    throw new UsageError('not inside a Git repository — use-npm-skills installs skills at the repository root')
  }

  if (isFile(path.join(root, '.pnp.cjs')) || isFile(path.join(root, '.pnp.js'))) {
    log.info('Yarn PnP detected — unsupported (use-npm-skills needs a node_modules/ directory); nothing to do')
    return { root, targetDirs: [], analysis: null, actions: [], warnings: log.warnings, exitCode: 0 }
  }

  const config = loadConfig(root, log)
  const all = enumerateSkills(root)
  const excluded = new Set(config.exclude ?? [])
  const active = all.filter((skill) => !excluded.has(skill.package))

  const actions: Action[] = []
  for (const skill of all) {
    if (excluded.has(skill.package)) {
      log.info(`skipping \`${skill.name}\` (\`${skill.package}\` is listed in "exclude" of ${CONFIG_FILE})`)
      actions.push({ kind: 'excluded', skill: skill.name, package: skill.package })
    }
  }

  const targetDirs = discoverTargetDirs(root, config)
  const analysis = analyzeStructure(root, targetDirs, platform, options.gitSymlinks)

  if (force && options.onTamperedList) {
    const tampered = listTampered(active, analysis)
    if (tampered.length > 0) options.onTamperedList(tampered)
  }

  const materialized = await materializeAll({
    root,
    active,
    analysis,
    force,
    confirmOverwrite: options.confirmOverwrite ?? (() => true),
    log,
  })
  actions.push(...materialized.actions)
  actions.push(...pruneOrphans(root, analysis.physicalDirs, active, log))

  if (all.length === 0) {
    log.info(
      'no skill packages installed — a skill package is an npm dependency with a skills/ directory ' +
        '(one subdirectory per skill, each containing a SKILL.md)',
    )
  } else {
    const synced = actions.filter((a) => ['added', 'updated', 'up-to-date', 'forced'].includes(a.kind)).length
    if (synced > 0) {
      log.info(`${synced} skill(s) in sync across ${analysis.physicalDirs.map((d) => relDisplay(root, d)).join(', ')}`)
    }
  }

  return {
    root,
    targetDirs,
    analysis,
    actions,
    warnings: log.warnings,
    exitCode: materialized.tampered ? 1 : 0,
  }
}
