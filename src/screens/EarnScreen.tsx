import React, { useState } from 'react';
import ScreenHeader from '../components/ScreenHeader';
import { GameState } from '../api';
import BalanceCard from '../components/BalanceCard';
import TransactionHistory from '../components/TransactionHistory';
import WithdrawModal from '../components/WithdrawModal';

type Props = {
  state: GameState;
  onStateChange: (state: GameState) => void;
  accountEmail?: string | null;
};

// This is the "Wallet" tab (kept as EarnScreen.tsx / the 'earn' tab id
// internally so routing/state elsewhere doesn't need to change). Tasks now
// live on the Friends tab — this screen is purely about coin balance,
// withdrawing, and transaction history. There is no real-money top-up here:
// balance is earned in-game (tapping/mining) and spent on the Character tab.
const EarnScreen: React.FC<Props> = ({ state, onStateChange }) => {
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  return (
    <div className="w-full max-w-xl px-4 pb-28">
      <ScreenHeader title="Wallet" subtitle="Manage your balance and payouts" points={state.points} pointsPerGhs={state.pointsPerGhs} />

      <div className="mt-4">
        <BalanceCard
          points={state.points}
          pointsPerGhs={state.pointsPerGhs}
          userId={state.userId}
          onWithdraw={() => setWithdrawOpen(true)}
        />
      </div>

      {withdrawOpen && (
        <WithdrawModal state={state} onStateChange={onStateChange} onClose={() => setWithdrawOpen(false)} />
      )}

      <div className="mt-4">
        <p className="text-xs text-[#85827d] mb-2">Transaction history</p>
        <TransactionHistory transactions={state.transactions} />
      </div>
    </div>
  );
};

export default EarnScreen;
