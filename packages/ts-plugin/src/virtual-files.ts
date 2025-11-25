/**
 * Virtual File Cache Manager
 *
 * Manages cached transformed versions of source files for the TypeScript language service.
 */

export interface VirtualFile {
  fileName: string
  virtualFileName: string
  transformedContent: string
  version: number
  timestamp: number
}

export interface VirtualFileCache {
  get(fileName: string, currentVersion: number): VirtualFile | undefined
  set(fileName: string, transformedContent: string, version: number): VirtualFile
  has(fileName: string): boolean
  invalidate(fileName: string): void
  clear(): void
  getVirtualFileName(fileName: string): string
  isVirtualFile(fileName: string): boolean
  getOriginalFileName(virtualFileName: string): string | undefined
  getStats(): CacheStats
}

export interface CacheStats {
  size: number
  hits: number
  misses: number
  invalidations: number
}

export function createVirtualFileCache(): VirtualFileCache {
  const cache = new Map<string, VirtualFile>()
  const stats: CacheStats = {
    size: 0,
    hits: 0,
    misses: 0,
    invalidations: 0
  }

  return {
    get(fileName: string, currentVersion: number): VirtualFile | undefined {
      const cached = cache.get(fileName)

      if (!cached) {
        stats.misses++
        return undefined
      }

      if (cached.version !== currentVersion) {
        stats.misses++
        cache.delete(fileName)
        stats.size = cache.size
        return undefined
      }

      stats.hits++
      return cached
    },

    set(fileName: string, transformedContent: string, version: number): VirtualFile {
      const virtualFileName = this.getVirtualFileName(fileName)

      const virtualFile: VirtualFile = {
        fileName,
        virtualFileName,
        transformedContent,
        version,
        timestamp: Date.now()
      }

      cache.set(fileName, virtualFile)
      stats.size = cache.size

      return virtualFile
    },

    has(fileName: string): boolean {
      return cache.has(fileName)
    },

    invalidate(fileName: string): void {
      if (cache.delete(fileName)) {
        stats.invalidations++
        stats.size = cache.size
      }
    },

    clear(): void {
      cache.clear()
      stats.size = 0
      stats.hits = 0
      stats.misses = 0
      stats.invalidations = 0
    },

    getVirtualFileName(fileName: string): string {
      const lastDot = fileName.lastIndexOf('.')
      if (lastDot === -1) {
        return `${fileName}.virtual.ts`
      }
      return `${fileName.slice(0, lastDot)}.virtual${fileName.slice(lastDot)}`
    },

    isVirtualFile(fileName: string): boolean {
      return fileName.includes('.virtual.')
    },

    getOriginalFileName(virtualFileName: string): string | undefined {
      if (!this.isVirtualFile(virtualFileName)) {
        return undefined
      }
      return virtualFileName.replace('.virtual.', '.')
    },

    getStats(): CacheStats {
      return { ...stats }
    }
  }
}

export function logCacheStats(cache: VirtualFileCache, label: string = 'Cache'): void {
  const stats = cache.getStats()
  const hitRate =
    stats.hits + stats.misses > 0
      ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
      : '0.0'

  console.log(
    `[effect-sugar] ${label} Stats:`,
    `size=${stats.size}`,
    `hits=${stats.hits}`,
    `misses=${stats.misses}`,
    `hit-rate=${hitRate}%`,
    `invalidations=${stats.invalidations}`
  )
}
