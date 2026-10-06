import React from 'react';
import Svg, { Path } from 'react-native-svg';

export interface QueueActionIconProps {
  color: string;
  size?: number;
}

/**
 * Icons for the play/queue actions on a playable container. Line icons use
 * the same 24-unit grid and 2px rounded stroke as the Now Playing controls
 * (Lucide geometry); Play is solid so the primary action reads first.
 */
export const PlayIcon: React.FC<QueueActionIconProps> = ({ color, size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M7 4.5v15l12.5-7.5z" />
  </Svg>
);

const LineIcon: React.FC<QueueActionIconProps & { children: React.ReactNode }> = ({ color, size = 20, children }) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </Svg>
);

/** A list with an arrow into its top slot. */
export const PlayNextIcon: React.FC<QueueActionIconProps> = (props) => (
  <LineIcon {...props}>
    <Path d="M16 12H3" />
    <Path d="M16 18H3" />
    <Path d="M10 6H3" />
    <Path d="M21 18V8a2 2 0 0 0-2-2h-5" />
    <Path d="m16 8-2-2 2-2" />
  </LineIcon>
);

/** A list with a plus at its end. */
export const AddToQueueIcon: React.FC<QueueActionIconProps> = (props) => (
  <LineIcon {...props}>
    <Path d="M11 12H3" />
    <Path d="M16 6H3" />
    <Path d="M16 18H3" />
    <Path d="M18 9v6" />
    <Path d="M21 12h-6" />
  </LineIcon>
);

/** A list with a restart arrow. */
export const ReplaceQueueIcon: React.FC<QueueActionIconProps> = (props) => (
  <LineIcon {...props}>
    <Path d="M21 6H3" />
    <Path d="M7 12H3" />
    <Path d="M7 18H3" />
    <Path d="M12 18a5 5 0 0 0 9-3 4.5 4.5 0 0 0-4.5-4.5c-1.33 0-2.54.54-3.41 1.41L11 14" />
    <Path d="M11 10v4h4" />
  </LineIcon>
);
