import { useEffect } from 'react';

export default function ErrorToast({ message, onClose, duration = 4000 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, onClose, duration]);

  return (
    <div className="fixed bottom-6 left-6 right-6 z-50 animate-toast-entrance md:left-auto md:right-6 md:bottom-6 md:max-w-[360px] md:w-full">
      <style>{`
        @keyframes slideInFade {
          from {
            opacity: 0;
            transform: translateY(1rem) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes shrinkWidth {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
        .animate-toast-entrance {
          animation: slideInFade 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-toast-progress {
          animation: shrinkWidth ${duration}ms linear forwards;
        }
      `}</style>
      
      <div className="rounded-xl p-3 shadow-2xl relative border border-[#f87171] bg-[#1a0e12] flex items-center gap-3 text-red-300 text-xs font-semibold overflow-hidden">
        {/* Icon */}
        <span className="material-symbols-outlined text-[18px] text-[#f87171] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
          error
        </span>
        
        {/* Message */}
        <div className="text-left flex-1 leading-normal text-[#fca5a5]">
          {message}
        </div>
        
        {/* Close Button */}
        <button 
          onClick={onClose} 
          className="text-red-400/60 hover:text-white transition-colors cursor-pointer flex-shrink-0 p-1 rounded-lg hover:bg-white/5"
          aria-label="Close error toast"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
        
        {/* Animated Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#f87171] w-full animate-toast-progress" />
      </div>
    </div>
  );
}
