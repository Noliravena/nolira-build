import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Stats } from 'node:fs'
import {
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path'

import type {
  SkillSummary,
  WorkspaceChange,
  WorkspaceDiff,
  WorkspaceFile,
  WorkspaceFileContent
} from '../../shared/host-api'
import { resolveGrokHome } from '../sessions'

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
  'target'
])

const MAX_SCANNED_FILES = 25_000
const MAX_EDITABLE_BYTES = 2 * 1024 * 1024
const MAX_DIFF_CHARACTERS = 500_000

export async function listWorkspaceFiles(
  workspacePath: string,
  query = '',
  requestedLimit = 40
): Promise<WorkspaceFile[]> {
  const workspace = resolve(workspacePath)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const limit = Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
  const candidates: Array<{ path: string; relativePath: string }> = []
  let scanned = 0

  async function visit(directory: string): Promise<void> {
    if (scanned >= MAX_SCANNED_FILES || candidates.length >= limit * 5) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (scanned >= MAX_SCANNED_FILES || candidates.length >= limit * 5) break
      if (entry.isSymbolicLink()) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await visit(path)
        continue
      }
      if (!entry.isFile()) continue
      scanned += 1
      const relativePath = relative(workspace, path)
      if (
        normalizedQuery &&
        !relativePath.toLocaleLowerCase().includes(normalizedQuery)
      ) {
        continue
      }
      candidates.push({ path, relativePath })
    }
  }

  await visit(workspace)
  const ranked = candidates
    .sort((left, right) => fileRank(left.relativePath, normalizedQuery) - fileRank(right.relativePath, normalizedQuery))
    .slice(0, limit)

  return Promise.all(
    ranked.map(async (candidate) => {
      const metadata = await stat(candidate.path)
      return {
        name: basename(candidate.path),
        path: candidate.path,
        relativePath: candidate.relativePath,
        mimeType: mimeTypeForPath(candidate.path),
        size: metadata.size
      }
    })
  )
}

export async function discoverSkills(options: {
  projectPath?: string
  query?: string
}): Promise<SkillSummary[]> {
  const roots: Array<{
    path: string
    source: SkillSummary['source']
  }> = []

  if (options.projectPath) {
    const projectPath = resolve(options.projectPath)
    roots.push(
      { path: join(projectPath, '.agents', 'skills'), source: 'project' },
      { path: join(projectPath, '.codex', 'skills'), source: 'project' },
      { path: join(projectPath, '.grok', 'skills'), source: 'project' },
      { path: join(projectPath, 'skills'), source: 'project' }
    )
  }
  roots.push(
    { path: join(resolveGrokHome(), 'skills'), source: 'grok' },
    { path: join(homedir(), '.codex', 'skills'), source: 'codex' }
  )

  const discovered = (
    await Promise.all(roots.map((root) => skillsInRoot(root.path, root.source)))
  ).flat()
  const query = options.query?.trim().toLocaleLowerCase()
  const unique = new Map<string, SkillSummary>()
  for (const skill of discovered) {
    const key = `${skill.source}:${skill.path}`
    if (
      query &&
      !`${skill.name} ${skill.description ?? ''}`.toLocaleLowerCase().includes(query)
    ) {
      continue
    }
    unique.set(key, skill)
  }

  return [...unique.values()].sort((left, right) => {
    if (left.source !== right.source) return left.source === 'project' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
}

export async function readWorkspaceFile(
  workspacePath: string,
  relativePath: string
): Promise<WorkspaceFileContent> {
  const approved = await approvedExistingFile(workspacePath, relativePath)
  if (approved.metadata.size > MAX_EDITABLE_BYTES) {
    throw new Error('Files larger than 2 MB cannot be opened in the editor.')
  }
  const bytes = await readFile(approved.path)
  if (bytes.includes(0)) throw new Error('Binary files cannot be opened in the editor.')
  return fileContent(approved.path, approved.relativePath, bytes.toString('utf8'), approved.metadata)
}

export async function writeWorkspaceFile(
  workspacePath: string,
  relativePath: string,
  content: string,
  expectedMtimeMs: number
): Promise<WorkspaceFileContent> {
  const approved = await approvedExistingFile(workspacePath, relativePath)
  if (!Number.isFinite(expectedMtimeMs)) throw new Error('Expected file version is invalid.')
  if (Math.abs(approved.metadata.mtimeMs - expectedMtimeMs) > 0.5) {
    throw new Error('The file changed on disk. Reload it before saving your edits.')
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_EDITABLE_BYTES) {
    throw new Error('Files larger than 2 MB cannot be saved in the editor.')
  }

  const temporaryPath = join(
    dirname(approved.path),
    `.${basename(approved.path)}.nolira-${randomUUID()}.tmp`
  )
  try {
    await writeFile(temporaryPath, content, {
      encoding: 'utf8',
      mode: approved.metadata.mode
    })
    await rename(temporaryPath, approved.path)
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }

  const metadata = await stat(approved.path)
  return fileContent(approved.path, approved.relativePath, content, metadata)
}

export async function listWorkspaceChanges(
  workspacePath: string
): Promise<{ branch?: string; changes: WorkspaceChange[] }> {
  const workspace = resolve(workspacePath)
  const [statusResult, branchResult] = await Promise.all([
    runGit(workspace, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    runGit(workspace, ['branch', '--show-current'])
  ])
  const entries = statusResult.stdout.split('\0')
  const changes: WorkspaceChange[] = []

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (!entry || entry.length < 4) continue
    const indexStatus = entry[0] ?? ' '
    const worktreeStatus = entry[1] ?? ' '
    const path = entry.slice(3)
    if (indexStatus === 'R' || indexStatus === 'C') index += 1
    changes.push({
      path,
      status: changeStatus(indexStatus, worktreeStatus),
      staged: indexStatus !== ' ' && indexStatus !== '?',
      indexStatus,
      worktreeStatus
    })
  }

  return {
    branch: branchResult.stdout.trim() || undefined,
    changes: changes.sort((left, right) => left.path.localeCompare(right.path))
  }
}

export async function workspaceDiff(
  workspacePath: string,
  relativePath: string,
  staged = false
): Promise<WorkspaceDiff> {
  const workspace = resolve(workspacePath)
  const path = safeRelativePath(workspace, relativePath)
  const relativeFile = relative(workspace, path)
  const args = ['diff', '--no-ext-diff', '--no-color', '--unified=3']
  if (staged) args.push('--cached')
  args.push('--', relativeFile)
  let diff = (await runGit(workspace, args)).stdout

  if (!diff && !staged) {
    const status = await listWorkspaceChanges(workspace)
    const change = status.changes.find((entry) => entry.path === relativeFile)
    if (change?.status === 'untracked') {
      const opened = await readWorkspaceFile(workspace, relativeFile)
      const lines = opened.content.split('\n')
      diff = [
        `diff --git a/${relativeFile} b/${relativeFile}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${relativeFile}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`)
      ].join('\n')
    }
  }

  const truncated = diff.length > MAX_DIFF_CHARACTERS
  return {
    path: relativeFile,
    diff: truncated
      ? `${diff.slice(0, MAX_DIFF_CHARACTERS)}\n… diff truncated …\n`
      : diff,
    staged,
    truncated
  }
}

async function skillsInRoot(
  root: string,
  source: SkillSummary['source']
): Promise<SkillSummary[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const skills = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map(async (entry): Promise<SkillSummary | undefined> => {
        const path = join(root, entry.name, 'SKILL.md')
        try {
          const content = (await readFile(path, 'utf8')).slice(0, 64 * 1024)
          const metadata = skillMetadata(content)
          return {
            id: `${source}:${path}`,
            name: metadata.name || entry.name,
            description: metadata.description,
            source,
            path
          }
        } catch {
          return undefined
        }
      })
  )
  return skills.filter((skill): skill is SkillSummary => Boolean(skill))
}

function skillMetadata(content: string): { name?: string; description?: string } {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/)
  const source = frontmatter?.[1] ?? ''
  const name = yamlScalar(source, 'name')
  const description = yamlScalar(source, 'description')
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return {
    name: name ?? heading,
    description: description?.slice(0, 280)
  }
}

function yamlScalar(source: string, key: string): string | undefined {
  const expression = new RegExp(`^${key}:\\s*(.+)$`, 'm')
  const value = source.match(expression)?.[1]?.trim()
  if (!value) return undefined
  return value.replace(/^(['"])(.*)\1$/, '$2')
}

function fileRank(path: string, query: string): number {
  if (!query) return path.split(/[\\/]/).length * 100 + path.length
  const lower = path.toLocaleLowerCase()
  const name = basename(lower)
  if (name === query) return 0
  if (name.startsWith(query)) return 10 + name.length
  const index = lower.indexOf(query)
  return (index < 0 ? 10_000 : 100 + index) + path.length
}

function mimeTypeForPath(path: string): string {
  return {
    '.avif': 'image/avif',
    '.c': 'text/x-c',
    '.cc': 'text/x-c++',
    '.cpp': 'text/x-c++',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.gif': 'image/gif',
    '.go': 'text/x-go',
    '.heic': 'image/heic',
    '.html': 'text/html',
    '.java': 'text/x-java',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.jsx': 'text/jsx',
    '.md': 'text/markdown',
    '.png': 'image/png',
    '.py': 'text/x-python',
    '.rs': 'text/x-rust',
    '.sh': 'text/x-shellscript',
    '.sql': 'text/x-sql',
    '.svg': 'image/svg+xml',
    '.swift': 'text/x-swift',
    '.toml': 'text/plain',
    '.ts': 'text/typescript',
    '.tsx': 'text/tsx',
    '.txt': 'text/plain',
    '.webp': 'image/webp',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml'
  }[extname(path).toLocaleLowerCase()] ?? 'application/octet-stream'
}

async function approvedExistingFile(
  workspacePath: string,
  requestedPath: string
): Promise<{ path: string; relativePath: string; metadata: Stats }> {
  const workspace = await realpath(resolve(workspacePath))
  const candidate = safeRelativePath(workspace, requestedPath)
  const path = await realpath(candidate)
  if (!containsPath(workspace, path)) {
    throw new Error('The requested file is outside the approved workspace.')
  }
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new Error('The requested path is not a file.')
  return { path, relativePath: relative(workspace, path), metadata }
}

function safeRelativePath(workspacePath: string, requestedPath: string): string {
  if (
    !requestedPath ||
    isAbsolute(requestedPath) ||
    requestedPath.includes('\0')
  ) {
    throw new Error('Workspace file path must be relative.')
  }
  const workspace = resolve(workspacePath)
  const path = resolve(workspace, requestedPath)
  if (!containsPath(workspace, path)) {
    throw new Error('The requested file is outside the approved workspace.')
  }
  return path
}

function containsPath(parent: string, candidate: string): boolean {
  const distance = relative(resolve(parent), resolve(candidate))
  return distance === '' || (!distance.startsWith('..') && !isAbsolute(distance))
}

function fileContent(
  path: string,
  relativePath: string,
  content: string,
  metadata: Stats
): WorkspaceFileContent {
  return {
    file: {
      name: basename(path),
      path,
      relativePath,
      mimeType: mimeTypeForPath(path),
      size: metadata.size
    },
    content,
    language: extname(path).slice(1).toLocaleLowerCase() || 'text',
    mtimeMs: metadata.mtimeMs
  }
}

function changeStatus(
  indexStatus: string,
  worktreeStatus: string
): WorkspaceChange['status'] {
  const pair = `${indexStatus}${worktreeStatus}`
  if (pair.includes('U') || pair === 'AA' || pair === 'DD') return 'conflict'
  if (pair.includes('R') || pair.includes('C')) return 'renamed'
  if (pair.includes('D')) return 'deleted'
  if (indexStatus === '?' && worktreeStatus === '?') return 'untracked'
  if (pair.includes('A')) return 'added'
  return 'modified'
}

function runGit(
  workspacePath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    execFile(
      'git',
      ['-C', workspacePath, ...args],
      {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }
        resolveResult({ stdout, stderr })
      }
    )
  })
}
