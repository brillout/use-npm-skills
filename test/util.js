'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { after } = require('node:test')

const CLI = path.join(__dirname, '..', 'cli.js')
const POSTINSTALL = path.join(__dirname, '..', 'postinstall.js')

const tmpDirs = []
after(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
})

function makeTmpDir() {
  // realpathSync: on macOS os.tmpdir() is a symlink (/var → /private/var) which would skew
  // path comparisons in assertions.
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'use-npm-skills-test-'))
  tmpDirs.push(dir)
  return dir
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function writeJson(filePath, value) {
  writeFile(filePath, JSON.stringify(value, null, 2) + '\n')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

// A minimal fake project: package.json, a lockfile, and (fake-)installed skill packages —
// exactly the on-disk layout the engine reads, no real package manager needed.
function makeProject({ rootPkg = {}, lockfile = 'package-lock.json', skillPkgs = [] } = {}) {
  const dir = makeTmpDir()
  writeJson(path.join(dir, 'package.json'), { name: 'test-app', private: true, ...rootPkg })
  if (lockfile) writeFile(path.join(dir, lockfile), '{}\n')
  for (const spec of skillPkgs) installSkillPkg(dir, spec)
  return dir
}

function installSkillPkg(projectDir, { name, version = '1.0.0', layout = 'root', skillDirName = 'the-skill', dependsOnUs = true, extraPkg = {} }) {
  const pkgDir = path.join(projectDir, 'node_modules', name)
  writeJson(path.join(pkgDir, 'package.json'), {
    name,
    version,
    ...(dependsOnUs ? { dependencies: { 'use-npm-skills': '^0.1.0' } } : {}),
    ...extraPkg,
  })
  const md = `---\nname: ${name.replace(/^@/, '').replace(/\//g, '-')}\ndescription: test skill of ${name}\n---\n\n# ${name}\n`
  if (layout === 'root') writeFile(path.join(pkgDir, 'SKILL.md'), md)
  else if (layout === 'skills') writeFile(path.join(pkgDir, 'skills', skillDirName, 'SKILL.md'), md)
  else if (layout === 'multi') {
    writeFile(path.join(pkgDir, 'skills', 'skill-one', 'SKILL.md'), md)
    writeFile(path.join(pkgDir, 'skills', 'skill-two', 'SKILL.md'), md)
  } // layout === 'none': no SKILL.md at all
  return pkgDir
}

// Env vars that leak lifecycle/CI context into the tests (e.g. when the suite itself runs
// under `npm test` or in CI).
const SCRUB_ENV = [
  'CI',
  'npm_lifecycle_event',
  'npm_lifecycle_script',
  'npm_command',
  'npm_config_global',
  'INIT_CWD',
  'PNPM_SCRIPT_SRC_DIR',
  'USE_NPM_SKILLS_TEST_DISABLE_LINKS',
]

function cleanEnv(extra = {}) {
  const env = { ...process.env }
  for (const key of SCRUB_ENV) delete env[key]
  return { ...env, ...extra }
}

function runCli(cwd, args = [], env = {}) {
  const res = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: cleanEnv(env) })
  if (res.error) throw res.error
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, output: res.stdout + res.stderr }
}

function runPostinstall(cwd, env = {}) {
  const res = spawnSync(process.execPath, [POSTINSTALL], {
    cwd,
    encoding: 'utf8',
    env: cleanEnv({ npm_lifecycle_event: 'postinstall', ...env }),
  })
  if (res.error) throw res.error
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, output: res.stdout + res.stderr }
}

function git(dir, args) {
  const res = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true })
  if (res.error) throw res.error
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`)
  return res.stdout
}

function gitInit(dir) {
  git(dir, ['init', '-q', '-b', 'main'])
  git(dir, ['config', 'user.name', 'Test User'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
}

function gitCommitAll(dir, message = 'user commit') {
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', message])
}

function gitLogTitles(dir) {
  return git(dir, ['log', '--format=%s']).trim().split('\n')
}

// Create a directory link the same way the tool does (junction on Windows — plain symlinks
// can require privileges there).
function makeDirLink(targetAbs, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  if (process.platform === 'win32') fs.symlinkSync(targetAbs, linkPath, 'junction')
  else fs.symlinkSync(targetAbs, linkPath)
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink()
  } catch {
    return false
  }
}

function exists(p) {
  return fs.existsSync(p)
}

module.exports = {
  makeTmpDir,
  writeFile,
  writeJson,
  readJson,
  makeProject,
  installSkillPkg,
  cleanEnv,
  runCli,
  runPostinstall,
  git,
  gitInit,
  gitCommitAll,
  gitLogTitles,
  makeDirLink,
  isLink,
  exists,
}
