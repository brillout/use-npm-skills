#!/usr/bin/env node
import fs from 'node:fs'
import type { Interface } from 'node:readline/promises'
import { UsageError } from './types.js'
import { sync } from './sync.js'

const HELP = `Usage: npx use-npm-skills [options]

Materializes the skills of all installed skill packages (npm packages that
ship skills in a skills/ directory, one subdirectory per skill, in any
node_modules/ of the repo) into the skills directories at your repo's root
(e.g. .agents/skills/, .claude/skills/), and prunes the skills of packages
that were removed.

Run it after adding, updating, or removing skill packages — it installs no
lifecycle hooks by design.

Options:
  --force       Overwrite locally-modified skills (asks per skill on a TTY)
  -h, --help    Show this help
  -v, --version Show the version

Config (.use-npm-skills.json at the project root):
  { "skillsDirs": ["…"], "exclude": ["some-skill-package"] }

Docs: https://github.com/brillout/use-npm-skills`

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  let force = false
  for (const arg of args) {
    if (arg === '--force' || arg === '-f') {
      force = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(HELP)
      return
    } else if (arg === '--version' || arg === '-v') {
      const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
      console.log(pkg.version)
      return
    } else {
      console.error(`Error: unknown argument \`${arg}\`\n\n${HELP}`)
      process.exitCode = 1
      return
    }
  }

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  let rl: Interface | undefined
  try {
    const result = await sync({
      force,
      onTamperedList(tampered) {
        console.log('the following skills were modified locally — their changes would be lost:')
        for (const entry of tampered) console.log(`  - ${entry.skill} (package \`${entry.package}\`)`)
      },
      async confirmOverwrite(skillName) {
        if (!interactive) return true
        if (!rl) {
          const { createInterface } = await import('node:readline/promises')
          rl = createInterface({ input: process.stdin, output: process.stdout })
        }
        const answer = await rl.question(`overwrite the local changes of skill \`${skillName}\`? [y/N] `)
        return /^y(es)?$/i.test(answer.trim())
      },
    })
    process.exitCode = result.exitCode
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`Error: ${err.message}`)
      process.exitCode = 1
    } else {
      throw err
    }
  } finally {
    rl?.close()
  }
}

await main()
