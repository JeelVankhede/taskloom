import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';
import { Link as RouterLink } from 'react-router';

export interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'color' | 'href'> {
  /** primary: the one main action of a view. secondary: everything else. danger: destructive. */
  tone?: 'primary' | 'secondary' | 'danger';
  /** Shows a spinner, keeps the width, and disables the button while an action runs. */
  loading?: boolean;
  /** Renders a link to this in-app path instead of a button. */
  to?: string;
}

const VARIANT = { primary: 'contained', secondary: 'outlined', danger: 'contained' } as const;
const COLOR = { primary: 'primary', secondary: 'primary', danger: 'error' } as const;

export function Button({
  tone = 'secondary',
  loading = false,
  disabled,
  to,
  ...rest
}: ButtonProps) {
  const common = { variant: VARIANT[tone], color: COLOR[tone], ...rest };
  if (to) return <MuiButton component={RouterLink} to={to} {...common} />;
  return <MuiButton loading={loading} disabled={disabled || loading} {...common} />;
}
