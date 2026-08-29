#!/usr/bin/env node
'use strict'

const log = require('./src/log.js')
const { UsageError, maybeInstallContext, DOCS_URL } = require('./src/context.js')

const HELP = `use-npm-skills — install AI agent skills as npm packages

Usage:
  npx use-npm-skills         Sync installed skill packages into the project's agent
                             skills directories (.claude/skills/ + .agents/skills/)
  npx use-npm-skills init    Scaffold a skill package in the current directory

Options:
  -h, --help                 Show this help
  -v, --version              Print the version

Docs: ${DOCS_URL}`

main()

function main() {
  const arg = process.argv[2]
  if (arg === '--help' || arg === '-h' || arg === 'help') {
    console.log(HELP)
    return
  }
  if (arg === '--version' || arg === '-v') {
    console.log(require('./package.json').version)
    return
  }
  if (arg === 'init') {
    run(() => require('./src/init.js').init(process.cwd()), { installSafe: false })
    return
  }
  if (arg === undefined || arg === 'sync') {
    run(() => require('./src/sync.js').sync(), { installSafe: true })
    return
  }
  log.error(`Unknown argument: ${arg}`)
  console.error(HELP)
  process.exitCode = 1
}

function run(fn, { installSafe }) {
  try {
    fn()
  } catch (err) {
    if (err instanceof UsageError) {
      log.error(err.message)
      process.exitCode = 1
      return
    }
    log.error(err && err.stack ? err.stack : String(err))
    if (installSafe && maybeInstallContext()) {
      // Possibly running as — or spawned by — an install lifecycle script (`npx` re-writes
      // npm_lifecycle_event, so a wired root postinstall is indistinguishable from a manual
      // `npx use-npm-skills`). A non-zero exit would fail the user's install, so exit 0;
      // the error is printed above.
      log.error('Exiting 0 so that a package manager install is not broken by the error above.')
      process.exitCode = 0
    } else {
      process.exitCode = 1
    }
  }
}
