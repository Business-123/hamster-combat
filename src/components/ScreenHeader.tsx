import React from 'react';
import { coinIcon } from '../images';
import { formatGhs } from '../utils/currency';

const ScreenHeader: React.FC<{ title: string; subtitle?: string; points: number; pointsPerGhs: number }> = ({
  title,
  subtitle,
  points,
  pointsPerGhs,
}) => {
  return (
    <div className="px-4 pt-6 pb-2 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="text-sm text-[#85827d] font-medium mt-1">{subtitle}</p>}
      <div className="mt-3 inline-flex items-center space-x-1 bg-[#272a2f] rounded-full px-4 py-1">
        <img src={coinIcon} alt="" className="w-5 h-5" />
        <span className="text-sm">{formatGhs(points, pointsPerGhs)}</span>
      </div>
    </div>
  );
};

export default ScreenHeader;
