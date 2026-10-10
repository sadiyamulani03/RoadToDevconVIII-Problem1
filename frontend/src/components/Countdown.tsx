import { useEffect, useState } from 'react'
import { formatDuration } from '../lib/format'

/** Live countdown to an absolute unix deadline (seconds). Re-renders once a second. */
export function Countdown({ deadline }: { deadline: bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [])

  const remaining = Number(deadline) - now
  if (remaining <= 0) return <span className="countdown countdown--ready">claimable now</span>
  return (
    <span className="countdown" title="If no move is made before this countdown ends, the waiting player can claim the game.">
      {formatDuration(remaining)}
    </span>
  )
}
