import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Page-level actions, aligned right on wide screens. */
  actions?: ReactNode;
}

/** The page's h1. Every screen has exactly one. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Stack
      component="header"
      direction={{ xs: 'column', sm: 'row' }}
      spacing={3}
      sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 6 }}
    >
      <div>
        <Typography variant="h1">{title}</Typography>
        {description && (
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            {description}
          </Typography>
        )}
      </div>
      {actions && (
        <Stack direction="row" spacing={2}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
