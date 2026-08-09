import React from 'react';
import InstallAppButton from './InstallAppButton';

type Props = {
  email: string | null;
  name: string | null;
  onClose: () => void;
  onLogout: () => void;
  onGoToLogin: () => void;
};

const ProfileModal: React.FC<Props> = ({ email, name, onClose, onLogout, onGoToLogin }) => {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-[#272a2f] border border-[#43433b] rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold">Account</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#85827d] hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {email ? (
          <>
            {name && <p className="text-sm text-white truncate">{name}</p>}
            <p className="text-[10px] text-[#85827d] mb-1">Signed in as</p>
            <p className="text-sm text-white truncate mb-4">{email}</p>
            <button
              type="button"
              onClick={onLogout}
              className="w-full text-xs font-bold bg-[#1c1f24] text-white rounded-lg py-2.5"
            >
              Log out
            </button>
          </>
        ) : (
          <>
            <p className="text-[10px] text-[#85827d] mb-1">Not signed in</p>
            <p className="text-[11px] text-[#c9c6c1] mb-4 leading-relaxed">
              Log in to save your progress to an account and access it from any device.
            </p>
            <button
              type="button"
              onClick={onGoToLogin}
              className="w-full text-xs font-bold bg-[#f3ba2f] text-black rounded-lg py-2.5"
            >
              Log in / Sign up
            </button>
          </>
        )}

        <InstallAppButton variant="row" className="mt-3" />
      </div>
    </div>
  );
};

export default ProfileModal;
