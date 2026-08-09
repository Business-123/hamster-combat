import React, { useEffect, useState } from 'react';
import { coinIcon } from '../images';
import { GameState, initializeUnblock, confirmUnblock } from '../api';

type Props = {
  state: GameState;
  onStateChange: (state: GameState) => void;
  accountEmail?: string | null;
};

const EMAIL_KEY = 'hamster-kombat-topup-email';

// Full-screen gate: rendered by App.tsx instead of the normal tabs whenever
// state.blocked is true (see server/game.js's evaluateTapBatch). Nothing
// underneath can earn coins again until the unblock fee is paid.
const BlockedScreen: React.FC<Props> = ({ state, onStateChange, accountEmail = null }) => {
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '');

  const isLoggedIn = Boolean(accountEmail);
  const email = isLoggedIn ? (accountEmail as string) : guestEmail;
  const price = state.unblockPriceGhs;

  // After the Payment Hub redirects back here (?unblock=1&reference=...&status=...),
  // confirm server-side and clear the block.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    if (!reference || !params.get('unblock')) return;

    setVerifying(true);
    confirmUnblock(reference)
      .then(({ unblocked, state: updated }) => {
        onStateChange(updated);
        setMessage(unblocked ? 'Payment confirmed — you can keep earning again!' : 'Could not confirm the payment yet.');
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'Could not confirm payment yet — try again shortly.');
      })
      .finally(() => {
        setVerifying(false);
        params.delete('reference');
        params.delete('status');
        params.delete('unblock');
        const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
        window.history.replaceState({}, '', clean);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!email.trim() || !email.includes('@')) {
      setMessage('Enter a valid email first');
      return;
    }
    if (!isLoggedIn) localStorage.setItem(EMAIL_KEY, email.trim());
    setPending(true);
    setMessage(null);
    try {
      const { authorizationUrl, demo, state: updated } = await initializeUnblock(email.trim());
      if (!authorizationUrl) {
        // DEMO mode: server unblocked immediately, no hub configured.
        if (updated) onStateChange(updated);
        if (demo) setMessage('Unblocked — you can keep earning again!');
        setPending(false);
        return;
      }
      window.location.href = authorizationUrl;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not start payment');
      setPending(false);
    }
  };

  return (
    <div className="bg-black flex justify-center min-h-screen">
      <div className="w-full max-w-xl px-5 pt-16 pb-10 flex flex-col items-center text-center text-white">
        <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="text-xl font-bold">Account blocked</h1>
        <p className="text-sm text-[#85827d] font-medium mt-2 max-w-sm">
          {state.blockedReason || 'We detected tapping faster than humanly possible on this account.'}
        </p>
        <p className="text-xs text-[#85827d] mt-1 max-w-sm">
          Earning is paused until you pay a small unblock fee.
        </p>

        <div className="bg-[#1c1f24] rounded-2xl px-5 py-4 mt-6 w-full max-w-xs">
          <p className="text-[10px] text-[#85827d]">Unblock fee</p>
          <div className="flex items-center justify-center space-x-2 mt-1">
            <img src={coinIcon} alt="" className="w-6 h-6" />
            <p className="text-2xl font-extrabold text-[#f3ba2f]">GH₵{price}</p>
          </div>
        </div>

        {!isLoggedIn && (
          <input
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            placeholder="you@example.com (for your receipt)"
            className="w-full max-w-xs bg-[#1c1f24] text-xs rounded-lg px-3 py-2 text-white placeholder-[#85827d] mt-4"
          />
        )}

        <button
          onClick={handlePay}
          disabled={pending || verifying}
          className="mt-5 w-full max-w-xs bg-[#f3ba2f] text-black font-bold rounded-xl py-3 disabled:opacity-50"
        >
          {pending ? '...' : `Pay GH₵${price} to unblock`}
        </button>

        {message && <p className="text-xs text-[#f3ba2f] mt-4 max-w-sm">{message}</p>}
        {verifying && <p className="text-xs text-[#85827d] mt-4">Confirming your payment...</p>}
      </div>
    </div>
  );
};

export default BlockedScreen;
