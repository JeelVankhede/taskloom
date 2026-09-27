import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { type ReactNode, useId } from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons, primary action last. */
  actions?: ReactNode;
  /** Blocks Escape and backdrop close while an action runs. */
  busy?: boolean;
}

/** A modal: focus is trapped inside and returns to the opener on close (MUI Modal). */
export function Dialog({ open, title, onClose, children, actions, busy = false }: DialogProps) {
  const titleId = useId();
  return (
    <MuiDialog
      open={open}
      onClose={busy ? undefined : onClose}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions sx={{ px: 6, pb: 5 }}>{actions}</DialogActions>}
    </MuiDialog>
  );
}
