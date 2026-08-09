import React from 'react';
import { hamsterCoin } from '../images';
import Hamster from '../icons/Hamster';
import Mine from '../icons/Mine';
import Coins from '../icons/Coins';
import Wallet from '../icons/Wallet';

export type Tab = 'character' | 'mine' | 'friends' | 'earn' | 'airdrop';

const TABS: { id: Tab; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'mine', label: 'Mine' },
  { id: 'friends', label: 'Earn' },
  { id: 'earn', label: 'Wallet' },
  { id: 'airdrop', label: 'Airdrop' },
];

const TabIcon: React.FC<{ id: Tab; active: boolean }> = ({ id, active }) => {
  const cls = `w-8 h-8 mx-auto ${active ? 'text-[#f3ba2f]' : ''}`;
  switch (id) {
    case 'character':
      return <Hamster size={32} className={cls} />;
    case 'mine':
      return <Mine className={cls} />;
    case 'friends':
      return <Coins className={cls} />;
    case 'earn':
      return <Wallet size={32} className={cls} />;
    case 'airdrop':
      return <img src={hamsterCoin} alt="Airdrop" className="w-8 h-8 mx-auto" />;
  }
};

const BottomNav: React.FC<{ active: Tab; onChange: (tab: Tab) => void }> = ({ active, onChange }) => {
  return (
    <div className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-[calc(100%-2rem)] max-w-xl bg-[#272a2f] flex justify-around items-center z-50 rounded-3xl text-xs">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`text-center w-1/5 m-1 p-2 rounded-2xl transition-colors ${
              isActive ? 'bg-[#1c1f24] text-white' : 'text-[#85827d]'
            }`}
          >
            <TabIcon id={tab.id} active={isActive} />
            <p className="mt-1">{tab.label}</p>
          </button>
        );
      })}
    </div>
  );
};

export default BottomNav;
