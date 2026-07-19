import { constants as fsConstants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { GrokAcpError } from './errors'

export interface ResolveGrokExecutableOptions {
  explicitPath?: string
  platform?: NodeJS.Platform
  arch?: string
  env?: NodeJS.ProcessEnv
  resourcesPath?: string
  homeDirectory?: string
}

/** Resolve a concrete executable instead of relying on a GUI app's reduced PATH. */
export async function resolveGrokExecutable(
  options: ResolveGrokExecutableOptions = {},
): Promise<string> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const env = options.env ?? process.env
  const home = options.homeDirectory ?? homedir()
  const executableName = platform === 'win32' ? 'grok.exe' : 'grok'
  const resourcesPath =
    options.resourcesPath ??
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath

  const candidates = unique([
    options.explicitPath,
    env.GROK_BINARY,
    resourcesPath && join(resourcesPath, 'runtime', `${platform}-${arch}`, executableName),
    resourcesPath && join(resourcesPath, 'runtime', executableName),
    join(dirname(process.execPath), 'runtime', `${platform}-${arch}`, executableName),
    join(dirname(process.execPath), 'runtime', executableName),
    join(home, '.grok', 'bin', executableName),
    platform === 'win32' && env.LOCALAPPDATA
      ? join(env.LOCALAPPDATA, 'grok', 'bin', executableName)
      : undefined,
    ...pathCandidates(env.PATH, executableName),
  ])

  for (const candidate of candidates) {
    if (await isExecutable(candidate, platform)) return candidate
  }

  throw new GrokAcpError(
    `Grok CLI was not found. Install it or select ${executableName} in Settings.`,
  )
}

async function isExecutable(path: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(path, platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

function pathCandidates(pathValue: string | undefined, executableName: string): string[] {
  if (!pathValue) return []
  return pathValue
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => join(part, executableName))
}

function unique(values: Array<string | false | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}
