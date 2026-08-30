/** Extract the `name` field from a SKILL.md YAML frontmatter block. */
export function parseFrontmatterName(content: string): string | null {
  const src = content.replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(src)
  if (!match) return null
  for (const line of match[1].split(/\r?\n/)) {
    const nameMatch = /^name\s*:\s*(.*)$/.exec(line)
    if (!nameMatch) continue
    let value = nameMatch[1].trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1).trim()
    }
    return value || null
  }
  return null
}

/** agentskills.io: lowercase letters, digits, hyphens; max 64 chars. */
export function isValidSkillName(name: string): boolean {
  return name.length <= 64 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)
}
