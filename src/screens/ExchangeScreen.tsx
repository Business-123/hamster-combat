import React from 'react';
import ScreenHeader from '../components/ScreenHeader';
import { binanceLogo, hamsterExchange, coinIcon } from '../images';
import { GameState } from '../api';
import { formatGhs } from '../utils/currency';

const PARTNERS = [
  { name: 'Binance', logo: binanceLogo, status: 'Listed' },
  { name: 'Hamster Exchange', logo: hamsterExchange, status: 'Listed' },
];

const ExchangeScreen: React.FC<{ state: GameState }> = ({ state }) => {
  return (
    <div className="w-full max-w-xl px-4 pb-28">
      <ScreenHeader title="Exchange" subtitle="Your coin, listed everywhere" points={state.points} pointsPerGhs={state.pointsPerGhs} />

      <div className="mt-4 bg-[#272a2f] rounded-2xl p-4">
        <p className="text-xs text-[#85827d] font-medium">Profit per hour</p>
        <div className="flex items-center space-x-2 mt-1">
          <img src={coinIcon} alt="" className="w-6 h-6" />
          <p className="text-2xl">+{formatGhs(state.profitPerHour, state.pointsPerGhs)}</p>
        </div>
        <p className="text-[11px] text-[#85827d] mt-2">
          Passive income accrues automatically, even while you're away — come back any
          time to collect it.
        </p>
      </div>

      <div className="mt-4">
        <p className="text-sm text-[#85827d] font-medium mb-2">Listed on</p>
        <div className="space-y-2">
          {PARTNERS.map((partner) => (
            <div key={partner.name} className="bg-[#272a2f] rounded-2xl p-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img src={partner.logo} alt={partner.name} className="w-10 h-10 rounded-full" />
                <p className="text-sm">{partner.name}</p>
              </div>
              <span className="text-[11px] text-green-400 font-medium">{partner.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 bg-[#272a2f] rounded-2xl p-4">
        <p className="text-sm">Current level</p>
        <p className="text-xs text-[#85827d] mt-1">
          {state.levelName} · Level {state.levelIndex + 1} of {state.levelCount}
        </p>
      </div>
    </div>
  );
};

export default ExchangeScreen;
