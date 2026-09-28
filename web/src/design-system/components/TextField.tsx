import MuiTextField, { type TextFieldProps as MuiTextFieldProps } from '@mui/material/TextField';
import { forwardRef } from 'react';

export type TextFieldProps = Omit<MuiTextFieldProps, 'variant' | 'error' | 'helperText'> & {
  /** The field's error message. Shown under the field and linked with aria-describedby. */
  errorText?: string;
  /** Guidance shown when there is no error. */
  hint?: string;
};

/** A labelled field. MUI links label, input, and helper text by id, so errors are announced. */
export const TextField = forwardRef<HTMLDivElement, TextFieldProps>(function TextField(
  { errorText, hint, ...rest },
  ref,
) {
  return (
    <MuiTextField
      ref={ref}
      variant="outlined"
      error={Boolean(errorText)}
      helperText={errorText ?? hint}
      {...rest}
    />
  );
});
