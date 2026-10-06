import React from 'react';
import { View, StyleSheet } from 'react-native';
import { TVKeyboardKey } from './TVKeyboardKey';

export interface TVKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  /** Fired whenever focus lands on any key — including pure D-pad navigation
   * with no press — so callers can tell "still moving around the keyboard"
   * apart from "actually idle". */
  onNavigate?: () => void;
  hasTVPreferredFocus?: boolean;
  testID?: string;
}

const ROWS: string[][] = [
  ['a', 'b', 'c', 'd', 'e', 'f'],
  ['g', 'h', 'i', 'j', 'k', 'l'],
  ['m', 'n', 'o', 'p', 'q', 'r'],
  ['s', 't', 'u', 'v', 'w', 'x'],
  ['y', 'z', '1', '2', '3', '4'],
  ['5', '6', '7', '8', '9', '0'],
];

/**
 * D-pad grid on-screen keyboard: a 6-column a–z / 0–9 grid plus a
 * space / backspace / clear row. There is no `TextInput`/system IME
 * anywhere else in this app (a 10-foot TV UI shouldn't rely on the system
 * keyboard covering the screen), so this is the sole text-entry mechanism.
 */
export const TVKeyboard: React.FC<TVKeyboardProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onNavigate,
  hasTVPreferredFocus,
  testID,
}) => {
  return (
    <View style={styles.container} testID={testID}>
      {ROWS.map((row, rowIndex) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((char, colIndex) => (
            <TVKeyboardKey
              key={char}
              label={char}
              onPress={() => onKeyPress(char)}
              onFocus={onNavigate}
              hasTVPreferredFocus={hasTVPreferredFocus && rowIndex === 0 && colIndex === 0}
              style={styles.key}
              testID={`keyboard-key-${char}`}
            />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <TVKeyboardKey
          label="space"
          onPress={() => onKeyPress(' ')}
          onFocus={onNavigate}
          style={styles.spaceKey}
          testID="keyboard-key-space"
        />
        <TVKeyboardKey
          label="⌫"
          onPress={onBackspace}
          onFocus={onNavigate}
          style={styles.key}
          testID="keyboard-key-backspace"
        />
        <TVKeyboardKey
          label="clear"
          onPress={onClear}
          onFocus={onNavigate}
          style={styles.clearKey}
          testID="keyboard-key-clear"
        />
      </View>
    </View>
  );
};

const KEY_SIZE = 30;
const KEY_GAP = 4;
const COLUMNS = 6;

/** Total pixel width of one 6-key row — exported so sibling elements (the
 * query line, recent searches) can match it exactly instead of stretching
 * to the rail's full width and ending further right than the keyboard grid. */
export const KEYBOARD_WIDTH = COLUMNS * KEY_SIZE + (COLUMNS - 1) * KEY_GAP;

/** Width of the space key: exactly 3 letter keys + their 2 in-between gaps. */
const SPACE_KEY_WIDTH = 3 * KEY_SIZE + 2 * KEY_GAP;

/** Clear takes whatever remains in the footer row after space + backspace + gaps, so the row still totals KEYBOARD_WIDTH. */
const CLEAR_KEY_WIDTH = KEYBOARD_WIDTH - SPACE_KEY_WIDTH - KEY_SIZE - 2 * KEY_GAP;

const styles = StyleSheet.create({
  container: {
    width: KEYBOARD_WIDTH,
    gap: KEY_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: KEY_GAP,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  spaceKey: {
    width: SPACE_KEY_WIDTH,
    height: KEY_SIZE,
  },
  clearKey: {
    width: CLEAR_KEY_WIDTH,
    height: KEY_SIZE,
  },
});
