import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Whether symlinks materialized at `root` will actually work as symlinks and
 * survive Git on this machine (https://stackoverflow.com/a/59761201). Both
 * conditions required: Git's effective `core.symlinks` resolves to true
 * (installer checkbox, global, or repo-local config — not overridden; unset
 * counts as disabled, Git for Windows' default), and creating a symlink at
 * `root` actually succeeds (Windows: Developer Mode or elevation; also rules
 * out filesystems without symlinks). Consulted on Windows only — elsewhere
 * symlinks are assumed to work.
 */
export function detectGitSymlinkSupport(root: string): boolean {
  return gitCoreSymlinks(root) && canCreateSymlink(root)
}

/** Effective `core.symlinks` at `root` — all config levels, the most specific wins. */
function gitCoreSymlinks(root: string): boolean {
  try {
    const out = execFileSync('git', ['config', '--type=bool', '--get', 'core.symlinks'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.toString().trim() === 'true'
  } catch {
    return false // git missing, or core.symlinks unset or false
  }
}

/** Probe: create (and immediately remove) a symlink at `root`. */
function canCreateSymlink(root: string): boolean {
  const probe = path.join(root, `.use-npm-skills-symlink-probe-${process.pid}`)
  try {
    fs.symlinkSync('.', probe, 'dir')
    return true
  } catch {
    return false
  } finally {
    try {
      fs.unlinkSync(probe)
    } catch {
      // the probe was never created
    }
  }
}
