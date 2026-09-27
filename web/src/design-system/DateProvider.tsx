import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import type { ReactNode } from 'react';

/**
 * For screens with date pickers. Pickers edit calendar dates (YYYY-MM-DD) through dayjs; values
 * never pass through a timezone conversion. Kept out of the app-wide providers so the pickers
 * load only with the screens that use them.
 */
export function DateProvider({ children }: { children: ReactNode }) {
  return <LocalizationProvider dateAdapter={AdapterDayjs}>{children}</LocalizationProvider>;
}
