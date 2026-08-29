'use strict'

const fs = require('fs')
const path = require('path')

const DOCS_URL = 'https://github.com/brillout/use-npm-skills'
const DEFAULT_SKILLS_DIRS = ['.claude/skills', '.agents/skills']
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']
// Events under which package managers run scripts as part of an install.
const LIFECYCLE_EVENTS = new Set(['preinstall', 'install', 'postinstall', 'prepare', 'dependencies'])

// Deliberate, user-facing errors (bad invocation / unusable environment) — reported without a
// stack trace, and always with a non-zero exit code.
class UsageError extends Error {}

function isTruthyEnv(value) {
  return !!value && value !== 'false' && value !== '0'
}

// Are we running as a package manager lifecycle script (i.e. as part of an install)?
// Lifecycle runs must never touch package.json and must never exit non-zero — a failing
// lifecycle script fails the user's install.
// Gotcha (measured with npm 10): `npx` overwrites npm_lifecycle_event to 'npx', so when the
// root hook `"postinstall": "npx use-npm-skills"` runs, the spawned process cannot tell itself
// apart from a user-typed `npx use-npm-skills` — see maybeInstallContext() for how that case
// is kept safe. `PNPM_SCRIPT_SRC_DIR` is pnpm-specific and survives the inner `npx` re-exec.
function isLifecycleRun() {
  if (LIFECYCLE_EVENTS.has(process.env.npm_lifecycle_event)) return true
  if (process.env.npm_command === 'install') return true
  if (process.env.PNPM_SCRIPT_SRC_DIR) return true
  return false
}

// True when we cannot rule out having been spawned by an install (e.g. via `npx` from a wired
// root postinstall hook). Used for exit codes on unexpected errors: never fail an install.
function maybeInstallContext() {
  return isLifecycleRun() || process.env.npm_lifecycle_event === 'npx' || process.env.npm_command === 'exec'
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function listLockfiles(dir) {
  return LOCKFILES.map((f) => path.join(dir, f)).filter((p) => fs.existsSync(p))
}

function findUp(startDir, predicate) {
  let dir = path.resolve(startDir)
  while (true) {
    if (predicate(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// The project root is the nearest directory with a lockfile — in a workspace that's the
// monorepo root by construction, which is where skills belong: skills apply repo-wide.
// Fallbacks (no lockfile anywhere): nearest node_modules/, then nearest package.json.
function findProjectRoot(startDir) {
  const byLockfile = findUp(startDir, (dir) => listLockfiles(dir).length > 0)
  if (byLockfile) return byLockfile
  const byNodeModules = findUp(startDir, (dir) => isDirectory(path.join(dir, 'node_modules')))
  if (byNodeModules) return byNodeModules
  return findUp(startDir, (dir) => fs.existsSync(path.join(dir, 'package.json')))
}

const CONFIG_KEYS = ['postinstall', 'gitCommit', 'skillsDirs', 'exclude']

function normalizeSkillsDir(dir) {
  const trimmed = String(dir).trim().replace(/[\\/]+$/, '')
  if (!trimmed || path.isAbsolute(trimmed)) return null
  const normalized = path.normalize(trimmed).split(path.sep).join('/')
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null
  return normalized
}

// Configuration lives under package.json#use-npm-skills at the project root.
function readConfig(rootDir) {
  const config = { postinstall: true, gitCommit: true, skillsDirs: null, exclude: [], warnings: [] }
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  } catch (err) {
    if (err && err.code !== 'ENOENT') config.warnings.push(`Could not read package.json at ${rootDir}: ${err.message}`)
    return config
  }
  const raw = pkg['use-npm-skills']
  if (raw === undefined) return config
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    config.warnings.push('Ignoring package.json#use-npm-skills: expected an object')
    return config
  }
  for (const key of Object.keys(raw)) {
    if (!CONFIG_KEYS.includes(key)) {
      config.warnings.push(`Unknown option package.json#use-npm-skills.${key} (known options: ${CONFIG_KEYS.join(', ')})`)
    }
  }
  for (const key of ['postinstall', 'gitCommit']) {
    if (raw[key] === undefined) continue
    if (typeof raw[key] === 'boolean') config[key] = raw[key]
    else config.warnings.push(`Ignoring package.json#use-npm-skills.${key}: expected a boolean`)
  }
  if (raw.skillsDirs !== undefined) {
    if (Array.isArray(raw.skillsDirs) && raw.skillsDirs.every((d) => typeof d === 'string')) {
      config.skillsDirs = raw.skillsDirs.map(normalizeSkillsDir).filter(Boolean)
      if (config.skillsDirs.length !== raw.skillsDirs.length) {
        config.warnings.push('Ignoring invalid package.json#use-npm-skills.skillsDirs entries (must be relative paths inside the project)')
      }
    } else {
      config.warnings.push('Ignoring package.json#use-npm-skills.skillsDirs: expected an array of strings')
    }
  }
  if (raw.exclude !== undefined) {
    if (Array.isArray(raw.exclude) && raw.exclude.every((d) => typeof d === 'string')) config.exclude = raw.exclude
    else config.warnings.push('Ignoring package.json#use-npm-skills.exclude: expected an array of package names')
  }
  return config
}

function getContext({ forceLifecycle = false } = {}) {
  const isLifecycle = forceLifecycle || isLifecycleRun()
  // INIT_CWD is where the user invoked the package manager — during a lifecycle script the
  // process cwd is elsewhere (the package's own directory, or the workspace root).
  const startDir = (isLifecycle && process.env.INIT_CWD) || process.cwd()
  const rootDir = findProjectRoot(startDir)
  return {
    isLifecycle,
    isCI: isTruthyEnv(process.env.CI),
    isGlobal: process.env.npm_config_global === 'true',
    startDir,
    rootDir,
    lockfilePaths: rootDir ? listLockfiles(rootDir) : [],
    isPnP: rootDir ? fs.existsSync(path.join(rootDir, '.pnp.cjs')) || fs.existsSync(path.join(rootDir, '.pnp.js')) : false,
    hasNodeModules: rootDir ? isDirectory(path.join(rootDir, 'node_modules')) : false,
    config: rootDir ? readConfig(rootDir) : null,
  }
}

module.exports = {
  DOCS_URL,
  DEFAULT_SKILLS_DIRS,
  UsageError,
  getContext,
  maybeInstallContext,
  isDirectory,
  isFile,
}
