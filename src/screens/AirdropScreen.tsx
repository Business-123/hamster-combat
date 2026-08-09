import React from 'react';
import ScreenHeader from '../components/ScreenHeader';
import { hamsterCoin } from '../images';
import { GameState } from '../api';

const ELIGIBLE_LEVEL_INDEX = 4; // "Diamond" and above, matches server/game.js LEVEL_NAMES

const AirdropScreen: React.FC<{ state: GameState }> = ({ state }) => {
  const eligible = state.levelIndex >= ELIGIBLE_LEVEL_INDEX;
  const tasksDone = state.completedTasks.length;
  const hasReferral = state.referralsCount > 0;

  const checklist = [
    { label: `Reach ${eligible ? 'Diamond' : 'a higher'} level`, done: eligible },
    { label: 'Complete at least one Earn task', done: tasksDone > 0 },
    { label: 'Invite at least one friend', done: hasReferral },
  ];

  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="w-full max-w-xl px-4 pb-28">
      <ScreenHeader title="Airdrop" subtitle="Coming soon" points={state.points} pointsPerGhs={state.pointsPerGhs} />

      <div className="mt-4 flex justify-center">
        <img src={hamsterCoin} alt="Airdrop" className="w-24 h-24" />
      </div>

      <div className="mt-4 bg-[#272a2f] rounded-2xl p-4 text-center">
        <p className="text-sm">
          {eligible ? "You're on track for the airdrop!" : 'Keep playing to qualify for the airdrop.'}
        </p>
        <p className="text-[11px] text-[#85827d] mt-1">
          {doneCount} / {checklist.length} requirements met
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {checklist.map((item) => (
          <div key={item.label} className="bg-[#272a2f] rounded-2xl p-3 flex items-center justify-between">
            <p className="text-xs">{item.label}</p>
            <span className={`text-[11px] font-medium ${item.done ? 'text-green-400' : 'text-[#85827d]'}`}>
              {item.done ? '✓ Done' : 'Pending'}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[#85827d] text-center mt-4">
        Airdrop distribution details will be announced closer to token launch.
      </p>
    </div>
  );
};

export default AirdropScreen;
