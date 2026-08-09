import React from 'react';

type Props = {
  email: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onLogout: () => void;
  onGoToLogin: () => void;
};

const ProfileMenu: React.FC<Props> = ({ email, open, onToggle, onClose, onLogout, onGoToLogin }) => {
  return (
    <div className="fixed top-4 right-4 z-[60]">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Account"
        className="w-9 h-9 rounded-full bg-[#272a2f] border border-[#43433b] flex items-center justify-center text-sm font-bold"
      >
        {email ? email.charAt(0).toUpperCase() : '👤'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[59]" onClick={onClose} />
          <div className="absolute right-0 mt-2 w-48 bg-[#272a2f] border border-[#43433b] rounded-xl p-3 z-[61] shadow-xl">
            {email ? (
              <>
                <p className="text-[10px] text-[#85827d] mb-1">Signed in as</p>
                <p className="text-xs text-white truncate mb-3">{email}</p>
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full text-xs font-bold bg-[#1c1f24] text-white rounded-lg py-2"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <p className="text-[10px] text-[#85827d] mb-1">Not signed in</p>
                <p className="text-[11px] text-white mb-3 leading-relaxed">
                  Log in to save your progress to an account and access it from any device.
                </p>
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="w-full text-xs font-bold bg-[#f3ba2f] text-black rounded-lg py-2"
                >
                  Log in / Sign up
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ProfileMenu;
