import React from 'react';
import { StyleProp, TextStyle, ViewStyle, View, StyleSheet, Easing } from 'react-native';
import TextTicker from 'react-native-text-ticker';

export interface MarqueeTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  speed?: number;
  delay?: number;
  isFocused?: boolean;
  scrollAlways?: boolean;
  spacerWidth?: number;
  testID?: string;
}

export const MarqueeText: React.FC<MarqueeTextProps> = ({
  text,
  style,
  containerStyle,
  speed = 100,
  delay = 0,
  isFocused,
  scrollAlways = true,
  spacerWidth = 24,
  testID,
}) => {
  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      <TextTicker
        style={style}
        animationType="scroll"
        bounce={false}
        loop
        easing={Easing.linear}
        repeatSpacer={spacerWidth}
        scrollSpeed={speed}
        marqueeDelay={delay}
        scroll={scrollAlways || isFocused === true}
        numberOfLines={1}
      >
        {text}
      </TextTicker>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    flexShrink: 1,
  },
});
