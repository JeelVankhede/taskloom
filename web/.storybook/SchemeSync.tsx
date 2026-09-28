import { useColorScheme } from '@mui/material/styles';
import { type ReactNode, useEffect } from 'react';

/** Applies the toolbar's theme to MUI's color scheme. */
export function SchemeSync({ mode, children }: { mode: 'light' | 'dark'; children: ReactNode }) {
  const { setMode } = useColorScheme();
  useEffect(() => setMode(mode), [mode, setMode]);
  return children;
}
