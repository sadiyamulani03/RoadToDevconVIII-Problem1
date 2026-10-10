import { useEffect, useState } from 'react'

/** Tiny hash router: `#/` = landing, `#/game/<id>` = game page. Hash routes survive refreshes and work on any static host. */
export function useHashRoute(): string {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#/, '') || '/')
  useEffect(() => {
    const onChange = () => setPath(window.location.hash.replace(/^#/, '') || '/')
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

export function navigate(path: string): void {
  window.location.hash = path
}

export function parseGameRoute(path: string): bigint | undefined {
  const m = /^\/game\/(\d+)$/.exec(path)
  if (!m) return undefined
  try {
    const id = BigInt(m[1]!)
    return id > 0n ? id : undefined
  } catch {
    return undefined
  }
}
