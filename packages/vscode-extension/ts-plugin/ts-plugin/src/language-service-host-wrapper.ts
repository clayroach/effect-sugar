/**
 * Language Service Host Wrapper
 *
 * Wraps the TypeScript language service host to provide transformed source
 * for files containing gen { } blocks.
 */

import * as ts from 'typescript/lib/tsserverlibrary'
import { transformSourceSafe, hasGenBlocks } from './transformer.js'

export interface TransformState {
  fileName: string
  original: string
  transformed: string
  version: string
}

export function createWrappedLanguageServiceHost(
  host: ts.LanguageServiceHost,
  getScriptVersion: (fileName: string) => string
): {
  wrappedHost: ts.LanguageServiceHost
  getTransformState: (fileName: string) => TransformState | undefined
} {
  const transformCache = new Map<string, TransformState>()

  function getTransformState(fileName: string): TransformState | undefined {
    if (!fileName.endsWith('.ts') && !fileName.endsWith('.tsx')) {
      return undefined
    }

    const version = getScriptVersion(fileName)

    const cached = transformCache.get(fileName)
    if (cached && cached.version === version) {
      return cached
    }

    const snapshot = host.getScriptSnapshot(fileName)
    if (!snapshot) {
      return undefined
    }

    const original = snapshot.getText(0, snapshot.getLength())

    if (!hasGenBlocks(original)) {
      return undefined
    }

    const result = transformSourceSafe(original)
    if (!result.hasChanges) {
      return undefined
    }

    const state: TransformState = {
      fileName,
      original,
      transformed: result.transformed,
      version
    }

    transformCache.set(fileName, state)
    console.log(
      `[effect-sugar] Transformed ${fileName} v${version} (${result.genBlocks.length} gen blocks)`
    )
    return state
  }

  // Use Proxy for proper method delegation
  const wrappedHost = new Proxy(host, {
    get(target, prop: string | symbol) {
      if (prop === 'getScriptSnapshot') {
        return function (fileName: string) {
          const state = getTransformState(fileName)
          if (state) {
            return ts.ScriptSnapshot.fromString(state.transformed)
          }
          return target.getScriptSnapshot(fileName)
        }
      }

      if (prop === 'readFile') {
        return function (fileName: string) {
          const state = getTransformState(fileName)
          if (state) {
            return state.transformed
          }
          return target.readFile?.(fileName)
        }
      }

      const value = target[prop as keyof ts.LanguageServiceHost]
      if (typeof value === 'function') {
        return (value as Function).bind(target)
      }
      return value
    }
  })

  return {
    wrappedHost,
    getTransformState
  }
}
