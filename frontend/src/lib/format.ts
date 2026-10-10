export function shortAddress(address: string | undefined): string {
  if (!address) return '—'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export const STATUS_LABELS = [
  'Waiting for opponent',
  'In progress',
  'Game over — win',
  'Game over — draw',
  'Forfeited',
] as const

export function statusLabel(status: number): string {
  return STATUS_LABELS[status] ?? `Unknown status (${status})`
}

/** "2d 4h", "3h 12m", "42m", "under a minute". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'ready'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return 'under a minute'
}

export function shareUrl(gameId: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/game/${gameId}`
}
