import React, { useState } from 'react';
import { GameState, withdraw } from '../api';
import { formatGhs } from '../utils/currency';

type Props = {
  state: GameState;
  onStateChange: (state: GameState) => void;
  onClose: () => void;
};

const WithdrawModal: React.FC<Props> = ({ state, onStateChange, onClose }) => {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const amountGhs = Number(amount);
  const coinsNeeded = Number.isFinite(amountGhs) ? Math.round(amountGhs * state.pointsPerGhs) : 0;
  const tasksLocked = !state.allTasksCompleted;

  const handleSubmit = async () => {
    setError(null);
    if (tasksLocked) {
      setError(`Finish all tasks first (${state.tasksCompletedCount}/${state.tasksTotal} done) — see the Tasks card on this tab.`);
      return;
    }
    if (!amountGhs || amountGhs <= 0) {
      setError('Enter an amount');
      return;
    }
    if (amountGhs < state.minWithdrawalGhs) {
      setError(`Minimum withdrawal is GH₵${state.minWithdrawalGhs}`);
      return;
    }
    if (coinsNeeded > state.points) {
      setError('Not enough balance for that amount');
      return;
    }
    if (!destination.trim() || destination.trim().length < 6) {
      setError('Enter a valid mobile money number');
      return;
    }
    setSubmitting(true);
    try {
      const res = await withdraw(amountGhs, destination.trim());
      onStateChange(res.state);
      setSuccess(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-[#272a2f] border border-[#43433b] rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold">Withdraw</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[#85827d] hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {success ? (
          <>
            <p className="text-[11px] text-[#c9c6c1] leading-relaxed mb-4">{success}</p>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-xs font-bold bg-[#f3ba2f] text-black rounded-lg py-2.5"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="text-[10px] text-[#85827d] mb-3">
              Available: {formatGhs(state.points, state.pointsPerGhs)}
            </p>

            {tasksLocked && (
              <div className="bg-[#1c1f24] border border-[#f3ba2f]/40 rounded-lg px-3 py-2.5 mb-3">
                <p className="text-[11px] text-[#f3ba2f] font-medium">
                  🔒 Complete all tasks to unlock withdrawals
                </p>
                <p className="text-[10px] text-[#85827d] mt-1">
                  {state.tasksCompletedCount}/{state.tasksTotal} tasks done — finish the rest on the Tasks
                  card (Earn tab), then come back here.
                </p>
              </div>
            )}

            <fieldset disabled={tasksLocked} className="disabled:opacity-40">
              <label className="block text-[10px] text-[#85827d] mb-1">Amount (GH₵)</label>
              <input
                type="number"
                min={state.minWithdrawalGhs}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Min GH₵${state.minWithdrawalGhs}`}
                className="w-full bg-[#1c1f24] text-xs rounded-lg px-3 py-2 text-white placeholder-[#85827d] mb-1"
              />
              {amountGhs > 0 && (
                <p className="text-[10px] text-[#85827d] mb-3">Deducts GH₵{amountGhs.toLocaleString()} from your balance</p>
              )}

              <label className="block text-[10px] text-[#85827d] mb-1">Mobile money number</label>
              <input
                type="tel"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="024 123 4567"
                className="w-full bg-[#1c1f24] text-xs rounded-lg px-3 py-2 text-white placeholder-[#85827d] mb-3"
              />
            </fieldset>

            <p className="text-[9px] text-[#85827d] leading-relaxed mb-3">
              Your GH₵ balance is deducted now. An admin reviews the request and sends payment to your
              mobile money number — usually within 24 hours.
            </p>

            {error && <p className="text-[11px] text-red-400 mb-3">{error}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || tasksLocked}
              className="w-full text-xs font-bold bg-[#f3ba2f] text-black rounded-lg py-2.5 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : tasksLocked ? 'Finish tasks to withdraw' : 'Request withdrawal'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WithdrawModal;
