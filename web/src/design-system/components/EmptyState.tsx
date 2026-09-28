import InboxOutlined from '@mui/icons-material/InboxOutlined';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** The next step, for example a create button or "Clear filters". */
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <Stack spacing={3} sx={{ alignItems: 'center', textAlign: 'center', py: 12, px: 4 }}>
      <Stack aria-hidden sx={{ color: 'text.secondary', fontSize: 40 }}>
        {icon ?? <InboxOutlined fontSize="inherit" />}
      </Stack>
      <Typography variant="h3" component="p">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}
      {action}
    </Stack>
  );
}
