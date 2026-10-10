import { EXPLORER_URL } from '../config/chains'
import type { TxState } from '../hooks/useGameActions'

export function TxToast({
  state,
  onDismiss,
}: {
  state: TxState
  onDismiss: () => void
}) {
  if (state.phase === 'idle') return null

  const isHash = /^0x[0-9a-fA-F]{64}$/.test(state.ref ?? '')
  const label =
    state.phase === 'signing'
      ? 'Confirm in your wallet…'
      : state.phase === 'pending'
        ? 'Transaction sent — waiting for Base Sepolia…'
        : state.phase === 'success'
          ? 'Confirmed on Base Sepolia'
          : 'Transaction failed'

  return (
    <div className={`toast toast--${state.phase}`} role="status" aria-live="polite">
      <div className="toast__body">
        <span className={state.phase === 'pending' || state.phase === 'signing' ? 'spinner' : state.phase === 'success' ? 'toast__ok' : 'toast__err'} />
        <div>
          <strong>{state.description}</strong>
          <div className="toast__label">{label}</div>
          {state.error && <div className="toast__error">{state.error}</div>}
          {isHash && (
            <a
              className="toast__link"
              href={`${EXPLORER_URL}/tx/${state.ref}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Basescan
            </a>
          )}
        </div>
      </div>
      {(state.phase === 'success' || state.phase === 'error') && (
        <button className="btn btn--ghost btn--small" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  )
}
