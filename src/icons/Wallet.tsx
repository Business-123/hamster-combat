import React from 'react';
import { IconProps } from '../utils/types';

const Wallet: React.FC<IconProps> = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="2.5" y="6" width="19" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M2.5 9.5H21.5" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="17" cy="14" r="1.4" fill="currentColor" />
  </svg>
);

export default Wallet;
