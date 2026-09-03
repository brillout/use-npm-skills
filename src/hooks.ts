import path from 'node:path'
import { analyzeStructure } from './analyze.js'
import { loadConfig } from './config.js'
import { enumerateSkills } from './enumerate.js'
import { readJsonSafe, relDisplay } from './fsUtils.js'
import { hashFileMap } from './hash.js'
import { Logger } from './logger.js'
import { materializeAll, readSkillFiles, stillProvided, syncStatus } from './materialize.js'
import { listOrphans, pruneOrphans } from './prune.js'
import { resolveProjectRoot } from './resolveRoot.js'
import { discoverTargetDirs } from './targets.js'
import { CONFIG_FILE, UsageError, type Action } from './types.js'

export interface HookOptions {
  /** The skill package's directory — a lifecycle script's working directory. Defaults to process.cwd(). */
  cwd?: string
  /** Whether a bad state fails install-package (exit 1). Defaults to whether the CI environment variable is set (to anything but "false"). */
  ci?: boolean
  /** For tests — defaults to process.platform. */
  platform?: NodeJS.Platform
  /** For tests — is Git symlink support available at the project root? Defaults to detecting it (Windows only). */
  gitSymlinks?: (root: string) => boolean
  log?: Logger
}

export interface HookResult {
  root: string
  actions: Action[]
  /** What a full sync would change for the other packages' skills (install-package only). */
  problems: string[]
  exitCode: number
}

/**
 * `use-npm-skills install-package`, run from a skill package's postinstall
 * script: materializes that one package's skills and nothing else, then
 * reports — never fixes — the skills of other packages a full sync would
 * change (missing, outdated, left over, modified locally). A bad state never
 * fails a local install: a failing postinstall aborts the whole install and
 * skips the other packages' postinstalls — the very ones that would install
 * the missing skills, a deadlock. Under CI it does fail, so CI goes red.
 */
export async function installPackage(options: HookOptions = {}): Promise<HookResult> {
  const log = options.log ?? new Logger()
  const ci = options.ci ?? isCI(process.env.CI)
  const pkg = readPackage(options.cwd)
  const root = resolveProjectRoot(projectDirOf(pkg.dir))
  const config = loadConfig(root, log)
  const excluded = new Set(config.exclude ?? [])

  // The crawl sees the package: package managers link every dependency into node_modules/ before running any postinstall (pnpm included).
  const all = enumerateSkills(root)
  const active = all.filter((skill) => !excluded.has(skill.package))
  const own = all.filter((skill) => skill.package === pkg.name)

  const targetDirs = discoverTargetDirs(root, config)
  const analysis = analyzeStructure(root, targetDirs, options.platform ?? process.platform, options.gitSymlinks)

  const actions: Action[] = []
  if (excluded.has(pkg.name)) {
    log.info(`skipping \`${pkg.name}\` (listed in "exclude" of ${CONFIG_FILE})`)
    for (const skill of own) actions.push({ kind: 'excluded', skill: skill.name, package: pkg.name })
  } else if (own.length === 0) {
    // e.g. the package's own repository (npm install runs its postinstall too), or a transitive dependency pnpm keeps out of node_modules/
    log.info(`\`${pkg.name}\` is not among the skill packages installed in ${root} — nothing to install`)
  } else {
    const materialized = await materializeAll({
      root,
      active,
      analysis,
      force: false,
      confirmOverwrite: () => false,
      log,
      only: pkg.name,
    })
    actions.push(...materialized.actions)
  }

  // Report — never fix — what a full sync would change for the other packages.
  const problems: string[] = []
  const claimed = new Set<string>()
  for (const skill of active) {
    if (claimed.has(skill.name)) continue // a name collision: the first package wins, as in a full sync
    claimed.add(skill.name)
    if (skill.package === pkg.name) continue
    let files: Map<string, Buffer>
    try {
      files = readSkillFiles(skill, log)
    } catch {
      continue
    }
    const status = syncStatus(skill, hashFileMap(files), analysis)
    if (status !== 'in sync') problems.push(`skill \`${skill.name}\` of \`${skill.package}\` is ${status}`)
  }
  const isOrphan = (meta: { package: string }, name: string) => !stillProvided(active, meta.package, name)
  for (const orphan of listOrphans(analysis.physicalDirs, isOrphan)) {
    problems.push(
      `skill \`${orphan.name}\` in ${relDisplay(root, orphan.dir)} is left over from ` +
        `\`${orphan.package || '(unknown)'}\`, which no longer provides it`,
    )
  }
  for (const action of actions) {
    if (action.kind === 'tampered') problems.push(`skill \`${action.skill}\` of \`${pkg.name}\` was modified locally`)
  }
  if (problems.length > 0) {
    for (const problem of problems) log.error(problem)
    log.error(
      'the skills directories are out of sync — run `npx use-npm-skills` to fix them' +
        (ci ? '' : ' (not failing the install)'),
    )
  }
  return { root, actions, problems, exitCode: problems.length > 0 && ci ? 1 : 0 }
}

/**
 * `use-npm-skills uninstall-package`, run from a skill package's uninstall
 * script: removes that one package's skills — pristine ones deleted with
 * their mirror symlinks, locally modified ones adopted — and nothing else.
 */
export function uninstallPackage(options: HookOptions = {}): HookResult {
  const log = options.log ?? new Logger()
  const pkg = readPackage(options.cwd)
  const root = resolveProjectRoot(projectDirOf(pkg.dir))
  const config = loadConfig(root, log)
  const targetDirs = discoverTargetDirs(root, config)
  const analysis = analyzeStructure(root, targetDirs, options.platform ?? process.platform, options.gitSymlinks)
  const actions = pruneOrphans(root, analysis.physicalDirs, (meta) => meta.package === pkg.name, log)
  return { root, actions, problems: [], exitCode: 0 }
}

/** The CI convention (GitHub Actions, GitLab CI, CircleCI, …): CI set, and not to "false". */
function isCI(value: string | undefined): boolean {
  return Boolean(value) && value !== 'false'
}

/** The package a lifecycle script runs for: the one whose directory is the working directory. */
function readPackage(cwd = process.cwd()): { dir: string; name: string } {
  const dir = path.resolve(cwd)
  const pkgJson = readJsonSafe(path.join(dir, 'package.json')) as Record<string, unknown> | null
  if (!pkgJson || typeof pkgJson.name !== 'string') {
    throw new UsageError(
      `${dir} is not an npm package (no package.json with a name) — ` +
        'install-package and uninstall-package run from a skill package\'s lifecycle scripts',
    )
  }
  return { dir, name: pkgJson.name }
}

/**
 * The project a package is installed in: the directory above the outermost
 * node_modules/ in its path (pnpm runs scripts inside the virtual store,
 * node_modules/.pnpm/…) — the package's own directory when it isn't inside one.
 */
function projectDirOf(packageDir: string): string {
  const parts = packageDir.split(path.sep)
  const index = parts.indexOf('node_modules')
  return index === -1 ? packageDir : parts.slice(0, index).join(path.sep) || path.sep
}
