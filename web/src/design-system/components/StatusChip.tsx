import CheckCircleOutline from '@mui/icons-material/CheckCircleOutlineOutlined';
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked';
import Chip from '@mui/material/Chip';

export interface StatusChipProps {
  name: string;
  /** Closed statuses (Done, Canceled) get a check icon; open ones an empty circle. */
  isClosed: boolean;
}

export function StatusChip({ name, isClosed }: StatusChipProps) {
  return (
    <Chip
      size="small"
      icon={isClosed ? <CheckCircleOutline /> : <RadioButtonUnchecked />}
      label={name}
      color={isClosed ? 'success' : 'default'}
      variant="outlined"
    />
  );
}
