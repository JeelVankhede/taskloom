import Chip from '@mui/material/Chip';
import type { LabelColor } from '@taskloom/contracts';
import { labelColor } from '../tokens';

export interface LabelChipProps {
  name: string;
  color: LabelColor;
}

/** Colored text over a faint tint of the same color; the name carries the meaning. */
export function LabelChip({ name, color }: LabelChipProps) {
  // The API types color as a string; an unknown value shows as slate rather than failing.
  const { light, dark } = labelColor[color] ?? labelColor.slate;
  return (
    <Chip
      size="small"
      label={name}
      sx={(theme) => ({
        color: light,
        bgcolor: `color-mix(in srgb, ${light} 8%, transparent)`,
        ...theme.applyStyles('dark', {
          color: dark,
          bgcolor: `color-mix(in srgb, ${dark} 14%, transparent)`,
        }),
      })}
    />
  );
}
