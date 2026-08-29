'use strict'

// use-npm-skills' own postinstall script. It runs while a package manager installs
// use-npm-skills as a dependency (skill packages depend on use-npm-skills), so:
//   - it must NEVER exit non-zero — that would fail the user's install;
//   - it runs the sync in lifecycle mode — package.json is never touched from here.
// Note: npm hides dependency-script output, so nothing here relies on being seen.

const fs = require('fs')
const path = require('path')

try {
  main()
} catch (err) {
  try {
    console.error('[use-npm-skills] postinstall error (ignored so the install is not broken):', err && err.stack ? err.stack : err)
  } catch {}
}
process.exitCode = 0

function main() {
  if (process.env.npm_config_global === 'true') return // global installs: not a project, nothing to do
  const { getContext } = require('./src/context.js')
  const ctx = getContext({ forceLifecycle: true })
  if (!ctx.rootDir) return
  writeStamp(ctx.rootDir)
  require('./src/sync.js').sync({ lifecycle: true })
}

// The stamp proves the install ran dependency lifecycle scripts. Explicit runs compare its
// mtime against the lockfile's: absent or older than the lockfile means the package manager
// doesn't run this script (e.g. pnpm 10 and Bun block dependency scripts by default), so a
// root postinstall hook gets set up instead. The .use-npm-skills/ directory is the tool's
// namespaced home inside node_modules.
function writeStamp(rootDir) {
  const stampDir = path.join(rootDir, 'node_modules', '.use-npm-skills')
  fs.mkdirSync(stampDir, { recursive: true })
  fs.writeFileSync(
    path.join(stampDir, 'stamp'),
    'Post-install script ran.\n' +
      '(use-npm-skills uses this file to detect whether the package manager runs dependency\n' +
      'lifecycle scripts — https://github.com/brillout/use-npm-skills)\n',
  )
}
