import Autocomplete from '@mui/material/Autocomplete';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import type { Priority } from '@taskloom/contracts';
import dayjs, { type Dayjs } from 'dayjs';
import { Button, PRIORITY_LABEL, TextField } from '../../../design-system';
import { type BoardFilters, isFiltered, PRIORITIES } from '../filters';

export interface FilterOption {
  id: string;
  name: string;
}

export interface FilterBarProps {
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  onClear: () => void;
  assignees: FilterOption[];
  labels: FilterOption[];
}

const UNASSIGNED: FilterOption = { id: 'none', name: 'Unassigned' };
const FIELD = { minWidth: 180, maxWidth: 260 };

const toDay = (value: string | null) => (value ? dayjs(value) : null);
const fromDay = (value: Dayjs | null) => (value?.isValid() ? value.format('YYYY-MM-DD') : null);

/** Every control writes the URL (through onChange); the board and summary follow it. */
export function FilterBar({ filters, onChange, onClear, assignees, labels }: FilterBarProps) {
  const set = (change: Partial<BoardFilters>) => onChange({ ...filters, ...change });
  const people = [UNASSIGNED, ...assignees];
  const selectedPeople = [
    ...(filters.unassigned ? [UNASSIGNED] : []),
    ...assignees.filter((a) => filters.assigneeIds.includes(a.id)),
  ];

  return (
    <Stack
      role="search"
      aria-label="Filter tasks"
      direction="row"
      useFlexGap
      spacing={3}
      sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 5 }}
    >
      <Autocomplete
        multiple
        size="small"
        limitTags={1}
        options={people}
        value={selectedPeople}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_e, value) =>
          set({
            unassigned: value.some((v) => v.id === UNASSIGNED.id),
            assigneeIds: value.filter((v) => v.id !== UNASSIGNED.id).map((v) => v.id),
          })
        }
        renderInput={(params) => <TextField {...params} label="Assignee" />}
        sx={FIELD}
      />
      <TextField
        select
        label="Priority"
        value={filters.priorities}
        onChange={(e) => set({ priorities: e.target.value as unknown as Priority[] })}
        slotProps={{
          select: {
            multiple: true,
            renderValue: (value) => (value as Priority[]).map((p) => PRIORITY_LABEL[p]).join(', '),
          },
        }}
        fullWidth={false}
        sx={FIELD}
      >
        {PRIORITIES.map((p) => (
          <MenuItem key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </MenuItem>
        ))}
      </TextField>
      <Autocomplete
        multiple
        size="small"
        limitTags={1}
        options={labels}
        value={labels.filter((l) => filters.labelIds.includes(l.id))}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_e, value) => set({ labelIds: value.map((v) => v.id) })}
        renderInput={(params) => <TextField {...params} label="Labels" />}
        sx={FIELD}
      />
      <DatePicker
        label="Due from"
        value={toDay(filters.dueFrom)}
        maxDate={toDay(filters.dueTo) ?? undefined}
        onChange={(value) => set({ dueFrom: fromDay(value) })}
        slotProps={{ textField: { size: 'small', sx: { width: 170 } }, field: { clearable: true } }}
      />
      <DatePicker
        label="Due to"
        value={toDay(filters.dueTo)}
        minDate={toDay(filters.dueFrom) ?? undefined}
        onChange={(value) => set({ dueTo: fromDay(value) })}
        slotProps={{ textField: { size: 'small', sx: { width: 170 } }, field: { clearable: true } }}
      />
      <TextField
        select
        label="State"
        value={filters.state}
        onChange={(e) => set({ state: e.target.value as BoardFilters['state'] })}
        fullWidth={false}
        sx={{ minWidth: 120 }}
      >
        <MenuItem value="all">All</MenuItem>
        <MenuItem value="open">Open</MenuItem>
        <MenuItem value="closed">Closed</MenuItem>
      </TextField>
      <FormControlLabel
        control={<Switch checked={filters.overdue} onChange={(_e, overdue) => set({ overdue })} />}
        label="Overdue only"
      />
      {isFiltered(filters) && (
        <Button size="small" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </Stack>
  );
}
