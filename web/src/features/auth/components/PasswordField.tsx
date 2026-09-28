import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import { forwardRef, useState } from 'react';
import { TextField, type TextFieldProps } from '../../../design-system';

/** A password field with a show/hide toggle. */
export const PasswordField = forwardRef<HTMLDivElement, TextFieldProps>(
  function PasswordField(props, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <TextField
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  onClick={() => setVisible((v) => !v)}
                  edge="end"
                  size="small"
                >
                  {visible ? (
                    <VisibilityOffOutlined fontSize="small" />
                  ) : (
                    <VisibilityOutlined fontSize="small" />
                  )}
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    );
  },
);
