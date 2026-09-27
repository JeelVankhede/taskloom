import Autocomplete from '@mui/material/Autocomplete';
import { TextField } from '../../../design-system';
import { TIMEZONES } from '../timezones';

export interface TimezoneFieldProps {
  value: string;
  onChange: (zone: string) => void;
  errorText?: string;
}

/** A searchable list of timezones. Typing "kolk" finds Asia/Kolkata. */
export function TimezoneField({ value, onChange, errorText }: TimezoneFieldProps) {
  return (
    <Autocomplete
      options={TIMEZONES}
      value={value}
      disableClearable
      autoHighlight
      onChange={(_event, zone) => onChange(zone)}
      getOptionLabel={(zone) => zone.replaceAll('_', ' ')}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Timezone"
          hint="Decides when a task becomes overdue"
          errorText={errorText}
        />
      )}
    />
  );
}
