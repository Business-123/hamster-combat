import React, { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

type Props = {
  // 'pill' — small floating chip for the join/login page.
  // 'row'  — full-width button for the settings/account modal.
  variant?: 'pill' | 'row';
  className?: string;
};

const DownloadIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IosTip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={`text-[11px] text-[#85827d] leading-relaxed ${className}`}>
    Tap <span className="text-white font-bold">Share</span> then{' '}
    <span className="text-white font-bold">Add to Home Screen</span>.
  </p>
);

// Shown on desktop/Android browsers that haven't (yet, or ever) fired
// beforeinstallprompt — e.g. already-dismissed prompts, or browsers that
// only expose install via their own menu. Keeps the button meaningful
// instead of just doing nothing when clicked.
const GenericTip: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={`text-[11px] text-[#85827d] leading-relaxed ${className}`}>
    Open your browser menu and choose{' '}
    <span className="text-white font-bold">Install app</span> or{' '}
    <span className="text-white font-bold">Add to Home Screen</span>.
  </p>
);

const InstallAppButton: React.FC<Props> = ({ variant = 'row', className = '' }) => {
  const { canInstall, installed, isIos, promptInstall } = useInstallPrompt();
  const [showTip, setShowTip] = useState(false);

  // Permanent: only hide once the app is actually installed — every other
  // state (including "browser hasn't offered a native prompt yet") still
  // shows the button, just with a fallback tip on tap instead of a no-op.
  if (installed) return null;

  const handleClick = async () => {
    if (canInstall) {
      await promptInstall();
      return;
    }
    setShowTip((v) => !v);
  };

  if (variant === 'pill') {
    return (
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-1.5 text-xs font-extrabold bg-[#f3ba2f] hover:bg-[#ffc94a] text-black rounded-full pl-3 pr-3.5 py-2 shadow-lg shadow-[#f3ba2f]/40 ring-2 ring-[#f3ba2f]/30 transition-colors animate-pulse-slow"
        >
          <DownloadIcon />
          Install app
        </button>
        {showTip && (
          <div className="absolute top-full mt-2 right-0 w-52 bg-[#1c1f24] border border-[#43433b] rounded-xl p-3 shadow-2xl shadow-black/50 z-10">
            {isIos ? <IosTip /> : <GenericTip />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center justify-center gap-2 text-sm font-extrabold bg-[#f3ba2f] hover:bg-[#ffc94a] text-black rounded-lg py-3 shadow-lg shadow-[#f3ba2f]/30 ring-2 ring-[#f3ba2f]/20 transition-colors"
      >
        <DownloadIcon />
        Install app
      </button>
      {showTip && (isIos ? <IosTip className="mt-2 text-center" /> : <GenericTip className="mt-2 text-center" />)}
    </div>
  );
};

export default InstallAppButton;
