import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export async function canonicalizeExistingPath(path: string): Promise<string> {
  return realpath(resolve(path))
}

export async function isPathInsideCanonicalRoots(
  candidate: string,
  roots: string[]
): Promise<boolean> {
  const target = await canonicalizeExistingPath(candidate)
  for (const root of roots) {
    try {
      const canonicalRoot = await canonicalizeExistingPath(root)
      const distance = relative(canonicalRoot, target)
      if (
        distance === '' ||
        (!distance.startsWith('..') && !isAbsolute(distance))
      ) {
        return true
      }
    } catch {
      // A removed workspace cannot authorize opening another path.
    }
  }
  return false
}
