import React from 'react';
import { IconProps } from '../utils/types';

type SpeakerProps = IconProps & { muted?: boolean };

const Speaker: React.FC<SpeakerProps> = ({ size = 24, className = '', muted = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M4 9.5H7L11 6V18L7 14.5H4C3.44772 14.5 3 14.0523 3 13.5V10.5C3 9.94772 3.44772 9.5 4 9.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      fill="currentColor"
    />
    {muted ? (
      <path d="M15.5 9.5L19.5 13.5M19.5 9.5L15.5 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    ) : (
      <>
        <path d="M15 9.2C15.9 10 16.4 11 16.4 12C16.4 13 15.9 14 15 14.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M17 6.8C18.7 8.1 19.6 10 19.6 12C19.6 14 18.7 15.9 17 17.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    )}
  </svg>
);

export default Speaker;
