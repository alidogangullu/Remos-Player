import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { spacing } from '../../theme';
import { Toast, ToastVariant } from './Toast';

/** Errors stay a little longer: they're the ones the user needs to read. */
const DURATION_MS: Record<ToastVariant, number> = {
  info: 3000,
  success: 3000,
  error: 4000,
};

export interface ToastApi {
  /** "In progress" or heads-up, e.g. `Starting "X"…` or a browse-shortcut hint. */
  info: (message: string) => void;
  /** A finished action, e.g. `Playing "X"`. */
  success: (message: string) => void;
  /** A failed action, e.g. `Couldn't play "X"`. */
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

interface ToastState {
  message: string;
  variant: ToastVariant;
}

/**
 * Owns the app's single toast: one position (top-right, under the TopBar),
 * one look, one timing. A new message replaces the current one and restarts
 * its timer, and it outlives tab switches since it isn't tied to a screen.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const show = useCallback((message: string, variant: ToastVariant) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, variant });
    timerRef.current = setTimeout(() => setToast(null), DURATION_MS[variant]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      info: (message) => show(message, 'info'),
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        style={styles.host}
        testID="app-toast"
      />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

const styles = StyleSheet.create({
  // Top-right, just under the floating TopBar (which ends at ~62dp), so it
  // never covers the device/volume button or the browse panel's Back button.
  // Right edge lines up with the device pill.
  host: {
    position: 'absolute',
    top: 76,
    right: spacing.topBarInset,
    maxWidth: 560,
    zIndex: 1000,
    elevation: 12,
  },
});
