import MenuItem from '@mui/material/MenuItem';
import type { Role } from '@taskloom/contracts';
import { TextField } from '../../../design-system';
import { GRANTABLE_ROLES, ROLE_LABEL } from '../../org/roles';

export interface RoleSelectProps {
  value: Role;
  onChange: (role: Role) => void;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium';
}

/** Admin, member, or contributor. Owner is never offered: nobody grants it this way. */
export function RoleSelect({
  value,
  onChange,
  label = 'Role',
  disabled,
  size = 'small',
}: RoleSelectProps) {
  return (
    <TextField
      select
      label={label}
      value={value}
      disabled={disabled}
      size={size}
      onChange={(event) => onChange(event.target.value as Role)}
      sx={{ minWidth: 150 }}
      fullWidth={false}
    >
      {GRANTABLE_ROLES.map((role) => (
        <MenuItem key={role} value={role}>
          {ROLE_LABEL[role]}
        </MenuItem>
      ))}
    </TextField>
  );
}
