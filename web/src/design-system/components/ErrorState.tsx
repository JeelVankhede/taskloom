import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  /** Recoverable errors offer a retry of only the failed request. */
  onRetry?: () => void;
  retrying?: boolean;
}

/** A failed region. role="alert" so the failure is announced when it appears. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <Stack
      role="alert"
      spacing={3}
      sx={{ alignItems: 'center', textAlign: 'center', py: 12, px: 4 }}
    >
      <ErrorOutline aria-hidden sx={{ fontSize: 40, color: 'error.main' }} />
      <Typography variant="h3" component="p">
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {message}
      </Typography>
      {onRetry && (
        <Button onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </Stack>
  );
}
