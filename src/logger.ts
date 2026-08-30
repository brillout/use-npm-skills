export class Logger {
  infos: string[] = []
  warnings: string[] = []

  constructor(private quiet = false) {}

  info(msg: string): void {
    this.infos.push(msg)
    if (!this.quiet) console.log(msg)
  }

  warn(msg: string): void {
    this.warnings.push(msg)
    if (!this.quiet) console.warn(`Warning: ${msg}`)
  }
}
