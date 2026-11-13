import { useEffect } from 'react'

export default function ErrorToast({ message, onClose, duration = 4000 }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timer)
  }, [message, onClose, duration])

  return (
    <div className="fixed bottom-6 left-4 right-4 z-[90] md:left-auto md:right-6 md:bottom-6 md:max-w-[380px] animate-in slide-in-from-bottom-3 fade-in duration-200">
      <div role="alert" className="toast-error relative flex items-start gap-3 overflow-hidden rounded-2xl border p-4 shadow-2xl">
        <span className="material-symbols-outlined mt-0.5 text-[19px] flex-shrink-0">error</span>
        <div className="min-w-0 flex-1 text-xs font-semibold leading-relaxed">{message}</div>
        <button onClick={onClose} className="toast-error-close -mr-1 -mt-1 rounded-lg p-1 transition-colors" aria-label="Close error notification">
          <span className="material-symbols-outlined text-[17px]">close</span>
        </button>
        <span className="toast-error-progress absolute bottom-0 left-0 h-[3px] w-full" style={{ animationDuration: `${duration}ms` }} />
      </div>
    </div>
  )
}
