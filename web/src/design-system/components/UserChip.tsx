import Avatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { initials } from '../format';

export interface UserChipProps {
  /** null means unassigned. */
  displayName: string | null;
  /** Deactivated members stay visible on their tasks, marked as such. */
  inactive?: boolean;
  size?: 'small' | 'medium';
  /** Hide the name and keep it as the accessible label (for dense cards). */
  avatarOnly?: boolean;
}

export function UserChip({
  displayName,
  inactive = false,
  size = 'small',
  avatarOnly = false,
}: UserChipProps) {
  const name = displayName ?? 'Unassigned';
  const label = inactive ? `${name} (deactivated)` : name;
  const px = size === 'small' ? 24 : 32;
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Avatar
        aria-hidden={!avatarOnly}
        aria-label={avatarOnly ? label : undefined}
        role={avatarOnly ? 'img' : undefined}
        sx={{
          width: px,
          height: px,
          fontSize: px * 0.42,
          // Deactivated members are grey rather than faded, so the initials keep their contrast.
          bgcolor: !displayName
            ? 'action.disabledBackground'
            : inactive
              ? 'text.secondary'
              : 'primary.main',
          color: !displayName
            ? 'text.secondary'
            : inactive
              ? 'background.paper'
              : 'primary.contrastText',
        }}
      >
        {displayName ? initials(displayName) : '–'}
      </Avatar>
      {!avatarOnly && (
        <Typography variant="body2" noWrap color={displayName ? 'text.primary' : 'text.secondary'}>
          {label}
        </Typography>
      )}
    </Stack>
  );
}
