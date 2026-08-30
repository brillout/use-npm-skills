import fs from 'node:fs'
import path from 'node:path'
import { isFile, toPosix } from './fsUtils.js'
import type { Logger } from './logger.js'
import { CONFIG_FILE, UsageError, type Config } from './types.js'

const KNOWN_KEYS = ['skillsDirs', 'exclude']

export function loadConfig(root: string, log: Logger): Config {
  const configPath = path.join(root, CONFIG_FILE)
  if (!isFile(configPath)) return {}

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (err) {
    throw new UsageError(`${CONFIG_FILE} is not valid JSON: ${(err as Error).message}`)
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UsageError(`${CONFIG_FILE} must contain a JSON object`)
  }

  const obj = raw as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.includes(key)) log.warn(`${CONFIG_FILE}: unknown key "${key}" — ignored`)
  }

  const config: Config = {}
  if (obj.skillsDirs !== undefined) {
    config.skillsDirs = parseStringArray(obj.skillsDirs, 'skillsDirs')
    for (const dir of config.skillsDirs) {
      const abs = path.resolve(root, dir)
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        throw new UsageError(`${CONFIG_FILE}: "skillsDirs" entry ${JSON.stringify(dir)} points outside the project`)
      }
      if (abs === root) {
        throw new UsageError(`${CONFIG_FILE}: "skillsDirs" entry ${JSON.stringify(dir)} is the project root itself`)
      }
    }
    config.skillsDirs = config.skillsDirs.map((d) => toPosix(path.relative(root, path.resolve(root, d))))
  }
  if (obj.exclude !== undefined) {
    config.exclude = parseStringArray(obj.exclude, 'exclude')
  }
  return config
}

function parseStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new UsageError(`${CONFIG_FILE}: "${key}" must be an array of strings`)
  }
  return value as string[]
}
