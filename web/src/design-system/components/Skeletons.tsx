import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

/**
 * Placeholders shaped like the final layout, so nothing jumps when data arrives. Each is
 * hidden from assistive technology; the region around it sets aria-busy.
 */
export function CardSkeleton() {
  return (
    <Card aria-hidden>
      <CardContent sx={{ p: 5 }}>
        <Skeleton variant="text" width="60%" height={28} />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="40%" />
      </CardContent>
    </Card>
  );
}

export function StatSkeleton() {
  return (
    <Card aria-hidden>
      <CardContent sx={{ p: 5 }}>
        <Skeleton variant="text" width={80} />
        <Skeleton variant="text" width={56} height={40} />
      </CardContent>
    </Card>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Stack aria-hidden spacing={2}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={44} />
      ))}
    </Stack>
  );
}
