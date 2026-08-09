// Every balance/reward in this app is stored internally as "coins" (an
// integer game-state field), but the UI shows the player everything in
// Ghana Cedis using the live pointsPerGhs exchange rate (admin-configurable,
// see server/settings.js). This keeps that conversion + formatting in one
// place instead of repeating `(coins / pointsPerGhs)` and a toLocaleString
// call in a dozen components.

export const formatGhs = (coins: number, pointsPerGhs: number): string => {
  if (!pointsPerGhs) return 'GH₵0.00';
  const ghs = coins / pointsPerGhs;
  return `GH₵${ghs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Same conversion but without the GH₵ prefix, for places that already show
// the symbol separately (e.g. next to a coin icon).
export const toGhs = (coins: number, pointsPerGhs: number): number => {
  if (!pointsPerGhs) return 0;
  return coins / pointsPerGhs;
};

export const formatGhsAmount = (ghsValue: number): string =>
  ghsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
