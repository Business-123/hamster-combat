import React from 'react';
import { Transaction } from '../api';

const TYPE_STYLE: Record<Transaction['type'], { icon: string; bg: string }> = {
  task: { icon: '✅', bg: 'bg-[#3dd68c]/15' },
  daily: { icon: '🎁', bg: 'bg-[#f3ba2f]/15' },
  referral: { icon: '🤝', bg: 'bg-[#8b7cf6]/15' },
  topup: { icon: '💳', bg: 'bg-[#4fa3ff]/15' },
  withdrawal: { icon: '🏧', bg: 'bg-[#ff7a59]/15' },
  admin: { icon: '⭐', bg: 'bg-[#f3ba2f]/15' },
  unblock: { icon: '🔓', bg: 'bg-[#ff6a3d]/15' },
  character: { icon: '🐹', bg: 'bg-[#f3ba2f]/15' },
};

const STATUS_STYLE: Record<Transaction['status'], string> = {
  completed: 'bg-green-500/15 text-green-400',
  pending: 'bg-[#f3ba2f]/15 text-[#f3ba2f]',
  failed: 'bg-red-500/15 text-red-400',
};

const timeAgo = (ts: number) => {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts).toLocaleDateString();
};

const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const DirectionBadge: React.FC<{ credit: boolean }> = ({ credit }) => (
  <div
    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
      credit ? 'bg-green-500/15' : 'bg-red-500/15'
    }`}
  >
    <svg
      viewBox="0 0 24 24"
      className={`w-3.5 h-3.5 ${credit ? 'text-green-400' : 'text-red-400'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {credit ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
    </svg>
  </div>
);

const TransactionHistory: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
  if (!transactions.length) {
    return (
      <div className="bg-[#272a2f] rounded-2xl p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-[#1c1f24] flex items-center justify-center mx-auto text-lg">
          🪙
        </div>
        <p className="text-xs text-[#85827d] mt-3">No transactions yet — complete a task or top up to get started.</p>
      </div>
    );
  }

  const groups: { label: string; items: Transaction[] }[] = [];
  transactions.forEach((tx) => {
    const label = dayLabel(tx.createdAt);
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(tx);
    else groups.push({ label, items: [tx] });
  });

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] uppercase tracking-wider text-[#85827d] font-bold mb-2 px-1">{group.label}</p>
          <div className="bg-[#272a2f] rounded-2xl overflow-hidden">
            <div className="divide-y divide-[#1c1f24]">
              {group.items.map((tx) => {
                const isCredit = tx.coins >= 0;
                const style = TYPE_STYLE[tx.type] ?? { icon: '🪙', bg: 'bg-[#1c1f24]' };
                return (
                  <div key={tx.id} className="flex items-center gap-3 px-3 py-3 active:bg-[#1c1f24]/60 transition-colors">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm shrink-0 ${style.bg}`}>
                      {style.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{tx.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-[#85827d]">{timeAgo(tx.createdAt)}</span>
                        {tx.status !== 'completed' && (
                          <span className={`text-[9px] font-bold rounded-full px-1.5 py-0.5 ${STATUS_STYLE[tx.status]}`}>
                            {tx.status === 'pending' ? 'Pending' : 'Failed'}
                          </span>
                        )}
                      </div>
                    </div>
                    <DirectionBadge credit={isCredit} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransactionHistory;
