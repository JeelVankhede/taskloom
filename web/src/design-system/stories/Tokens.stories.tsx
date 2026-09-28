import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useColorScheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  labelColor,
  motion,
  palette,
  priorityColor,
  radius,
  spacingUnit,
  typeScale,
  zIndex,
} from '../tokens';

function Swatch({ name, color, text }: { name: string; color: string; text?: string }) {
  return (
    <Stack spacing={1} sx={{ width: 120 }}>
      <Box
        sx={{
          height: 48,
          borderRadius: 1,
          bgcolor: color,
          border: 1,
          borderColor: 'divider',
          color: text,
        }}
      />
      <Typography variant="caption">{name}</Typography>
      <Typography variant="caption" color="text.secondary">
        {color}
      </Typography>
    </Stack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 8 }}>
      <Typography variant="h3" component="h2" sx={{ mb: 4 }}>
        {title}
      </Typography>
      <Stack direction="row" spacing={4} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {children}
      </Stack>
    </Box>
  );
}

function Tokens() {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const p = palette[scheme];
  return (
    <Box component="main" sx={{ bgcolor: 'background.default', p: 6 }}>
      <Typography variant="h1" sx={{ mb: 6 }}>
        Design tokens ({scheme})
      </Typography>
      <Section title="Palette">
        {(['primary', 'secondary', 'error', 'warning', 'success', 'info'] as const).map((k) => (
          <Swatch key={k} name={k} color={p[k].main} />
        ))}
        <Swatch name="background" color={p.background.default} />
        <Swatch name="paper" color={p.background.paper} />
        <Swatch name="text" color={p.text.primary} />
        <Swatch name="text secondary" color={p.text.secondary} />
        <Swatch name="divider" color={p.divider} />
      </Section>
      <Section title="Priority">
        {Object.entries(priorityColor[scheme]).map(([k, c]) => (
          <Swatch key={k} name={k} color={c} />
        ))}
      </Section>
      <Section title="Labels">
        {Object.entries(labelColor).map(([k, c]) => (
          <Swatch key={k} name={k} color={c[scheme]} />
        ))}
      </Section>
      <Section title="Type scale">
        <Stack spacing={2}>
          {(Object.keys(typeScale) as (keyof typeof typeScale)[]).map((k) => (
            <Typography key={k} variant={k} component="p">
              {k}: The quick brown fox
            </Typography>
          ))}
        </Stack>
      </Section>
      <Section title="Spacing (theme.spacing(n) = n × 4 px)">
        {[1, 2, 3, 4, 6, 8, 12].map((n) => (
          <Stack key={n} spacing={1} sx={{ alignItems: 'center' }}>
            <Box
              sx={{ width: n * spacingUnit, height: n * spacingUnit, bgcolor: 'primary.main' }}
            />
            <Typography variant="caption">{n}</Typography>
          </Stack>
        ))}
      </Section>
      <Section title="Radius">
        {Object.entries(radius).map(([k, r]) => (
          <Stack key={k} spacing={1} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: `${Math.min(r, 28)}px`,
                border: 2,
                borderColor: 'primary.main',
              }}
            />
            <Typography variant="caption">
              {k} {r}px
            </Typography>
          </Stack>
        ))}
      </Section>
      <Section title="Layers and motion">
        <Typography variant="body2" component="pre" sx={{ m: 0 }}>
          {JSON.stringify({ zIndex, motion }, null, 2)}
        </Typography>
      </Section>
    </Box>
  );
}

const meta = { title: 'Design system/Tokens', component: Tokens } satisfies Meta<typeof Tokens>;
export default meta;
export const All: StoryObj<typeof meta> = {};
