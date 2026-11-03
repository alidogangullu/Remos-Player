import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../../theme';

export interface CheckIconProps {
  size?: number;
  color?: string;
}

/** Stroke checkmark for feature lists; decorative, so hidden from accessibility. */
export const CheckIcon: React.FC<CheckIconProps> = ({ size = 18, color = colors.primary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
    <Path
      d="M5 12.5l4.5 4.5L19 7.5"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);
