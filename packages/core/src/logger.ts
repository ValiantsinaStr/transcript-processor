import type { SDKConfig } from './types.js'

type LogLevel = SDKConfig['logging']['level']

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  event?: string
  step?: string
  status?: string
  durationMs?: number
  chunkIndex?: number
  inputSegments?: number
  error?: string
  [key: string]: unknown
}

export class Logger {
  private readonly minLevel: number
  private readonly out: NodeJS.WritableStream

  constructor(level: LogLevel = 'info', out: NodeJS.WritableStream = process.stderr) {
    this.minLevel = LEVELS[level]
    this.out = out
  }

  private write(level: LogLevel, entry: Omit<LogEntry, 'timestamp' | 'level'>): void {
    if (LEVELS[level] < this.minLevel) return
    const line: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...entry,
    }
    this.out.write(JSON.stringify(line) + '\n')
  }

  info(entry: Omit<LogEntry, 'timestamp' | 'level'>): void {
    this.write('info', entry)
  }

  warn(entry: Omit<LogEntry, 'timestamp' | 'level'>): void {
    this.write('warn', entry)
  }

  error(entry: Omit<LogEntry, 'timestamp' | 'level'>): void {
    this.write('error', entry)
  }

  debug(entry: Omit<LogEntry, 'timestamp' | 'level'>): void {
    this.write('debug', entry)
  }
}
