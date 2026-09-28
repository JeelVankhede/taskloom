import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { useColorScheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { BarChart } from '@mui/x-charts/BarChart';
import { PRIORITY_LABEL, StatSkeleton } from '../../../design-system';
import { priorityColor } from '../../../design-system/tokens';
import type { SummaryFieldsFragment } from '../../../generated/graphql';

export interface SummaryPanelProps {
  summary: SummaryFieldsFragment;
}

/** Totals and tasks by priority, for exactly the tasks the board shows. */
export function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <Box
      component="section"
      aria-label="Summary"
      sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, mb: 5 }}
    >
      <StatCards summary={summary} />
      <PriorityChart summary={summary} />
    </Box>
  );
}

export function StatCards({ summary }: SummaryPanelProps) {
  const stats = [
    { label: 'Total', value: summary.total },
    { label: 'Open', value: summary.open },
    { label: 'Overdue', value: summary.overdue, alert: summary.overdue > 0 },
    { label: 'Closed', value: summary.closed },
  ];
  return (
    <Box
      component="dl"
      sx={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(2, 1fr)', m: 0 }}
    >
      {stats.map((stat) => (
        // Each card is the one div a <dl> allows around a dt/dd pair.
        <Card key={stat.label} sx={{ p: 4 }}>
          <Typography component="dt" variant="body2" color="text.secondary">
            {stat.label}
          </Typography>
          <Typography
            component="dd"
            variant="h2"
            sx={{ m: 0, color: stat.alert ? 'error.main' : 'text.primary' }}
          >
            {stat.value.toLocaleString()}
          </Typography>
        </Card>
      ))}
    </Box>
  );
}

/** Always all five priorities (the API zero-fills them), so the axis never shifts. */
export function PriorityChart({ summary }: SummaryPanelProps) {
  const { colorScheme } = useColorScheme();
  const colors = priorityColor[colorScheme === 'dark' ? 'dark' : 'light'];
  const rows = summary.byPriority;
  const description = rows.map((r) => `${PRIORITY_LABEL[r.priority]} ${r.total}`).join(', ');
  return (
    <Card>
      <CardContent sx={{ p: 4, '&:last-child': { pb: 2 } }}>
        <Typography variant="h4" component="h2">
          Tasks by priority
        </Typography>
        {/* The chart is drawn for sighted users; its numbers are also given as text. */}
        <Box role="img" aria-label={`Tasks by priority: ${description}`}>
          <BarChart
            height={180}
            margin={{ left: 0, right: 8, top: 16, bottom: 0 }}
            xAxis={[
              {
                scaleType: 'band',
                data: rows.map((r) => PRIORITY_LABEL[r.priority]),
                colorMap: {
                  type: 'ordinal',
                  values: rows.map((r) => PRIORITY_LABEL[r.priority]),
                  colors: rows.map((r) => colors[r.priority]),
                },
              },
            ]}
            yAxis={[{ tickMinStep: 1, width: 40 }]}
            series={[{ data: rows.map((r) => r.total), label: 'Tasks' }]}
            hideLegend
          />
        </Box>
      </CardContent>
    </Card>
  );
}

export function SummarySkeleton() {
  return (
    <Box
      role="status"
      aria-label="Loading the summary"
      sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, mb: 5 }}
    >
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </Box>
      <StatSkeleton />
    </Box>
  );
}
