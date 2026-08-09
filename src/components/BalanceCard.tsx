import React from 'react';
import { coinIcon } from '../images';
import { formatGhs } from '../utils/currency';

type Props = {
  points: number;
  pointsPerGhs: number;
  userId?: string;
  onWithdraw?: () => void;
};

// Masks a user id into a card-number-style string, e.g. "4471 •••• •••• 8823".
const maskAsCardNumber = (id: string) => {
  const digits = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const padded = (digits + '00000000').slice(0, 12);
  return `${padded.slice(0, 4)} •••• •••• ${padded.slice(8, 12)}`;
};

const BalanceCard: React.FC<Props> = ({ points, pointsPerGhs, userId = '', onWithdraw }) => {
  return (
    <div className="balance-card relative w-full rounded-2xl overflow-hidden p-5 text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]">
      {/* Base gradient + faint diagonal foil sheen (signature element) */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#1c1f24] via-[#20242b] to-[#0f1114]" />
      <div className="balance-card-sheen absolute inset-0" />
      <div
        className="absolute -right-10 -top-10 w-40 h-40 rounded-full opacity-20 blur-2xl"
        style={{ background: 'radial-gradient(circle, #f3ba2f, transparent 70%)' }}
      />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-[#c9c6c1] uppercase">Balance</p>
            <div className="flex items-center space-x-2 mt-1.5">
              <img src={coinIcon} alt="" className="w-6 h-6" />
              <span className="text-2xl font-extrabold leading-none">{formatGhs(points, pointsPerGhs)}</span>
            </div>
          </div>

          {/* Chip glyph */}
          <div className="w-9 h-7 rounded-md bg-gradient-to-br from-[#f3ba2f] to-[#c98f14] flex items-center justify-center shrink-0">
            <div className="w-6 h-4 rounded-sm border border-black/25 grid grid-cols-3 grid-rows-2 gap-[1px] p-[2px]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-black/20 rounded-[1px]" />
              ))}
            </div>
          </div>
        </div>

        <p className="text-[13px] tracking-[0.15em] text-[#c9c6c1] mt-4 font-mono">
          {maskAsCardNumber(userId || 'HAMSTERKOMBAT')}
        </p>

        <div className="flex items-end justify-between mt-4">
          <p className="text-[9px] text-[#85827d]">GH₵ exchange rate updates live from the admin panel.</p>
          <p className="text-[9px] text-[#85827d] mt-1 text-right">HAMSTER KOMBAT</p>
        </div>

        {onWithdraw && (
          <button
            type="button"
            onClick={onWithdraw}
            className="mt-4 w-full text-xs font-bold bg-white/10 hover:bg-white/15 text-[#f3ba2f] rounded-xl py-2.5 backdrop-blur-sm transition-colors"
          >
            Withdraw
          </button>
        )}
      </div>

      <style>{`
        .balance-card-sheen {
          background: linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.06) 35%, rgba(255,255,255,0.14) 42%, rgba(255,255,255,0.06) 50%, transparent 65%);
          background-size: 250% 250%;
          animation: sheen-sweep 6s ease-in-out infinite;
        }
        @keyframes sheen-sweep {
          0% { background-position: 120% 0%; }
          50% { background-position: 0% 100%; }
          100% { background-position: 120% 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .balance-card-sheen { animation: none; }
        }
      `}</style>
    </div>
  );
};

export default BalanceCard;
