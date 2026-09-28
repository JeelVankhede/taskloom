import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { checkSignUp, ErrorCode, LENGTH, normalizeEmail, PASSWORD } from '@taskloom/contracts';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, TextField } from '../../../design-system';
import { messageFor } from '../../../lib/error-messages';
import { AuthError, authApi } from '../api/auth-api';
import { session } from '../session';
import { PasswordField } from './PasswordField';

/** Every rule comes from checkSignUp, the same function the API runs. */
const schema = z
  .object({ displayName: z.string(), email: z.string(), password: z.string() })
  .superRefine((values, ctx) => {
    for (const violation of checkSignUp(values)) {
      ctx.addIssue({ code: 'custom', path: [violation.field], message: violation.message });
    }
  });

type Values = z.infer<typeof schema>;

export function SignUpForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      session.start(
        await authApi.signUp({
          displayName: values.displayName.trim(),
          email: normalizeEmail(values.email),
          password: values.password,
        }),
      );
    } catch (error) {
      const code = error instanceof AuthError ? error.code : undefined;
      if (code === ErrorCode.EMAIL_TAKEN) {
        setError(
          'email',
          { message: 'An account with this email already exists. Sign in instead.' },
          { shouldFocus: true },
        );
      } else if (error instanceof AuthError && error.field) {
        setError(error.field, { message: error.message }, { shouldFocus: true });
      } else {
        setError('root.server', { message: messageFor(code) });
      }
    }
  });

  const field = (name: keyof Values) => {
    const { ref, ...rest } = register(name);
    return { inputRef: ref, ...rest, errorText: errors[name]?.message };
  };

  return (
    <Stack component="form" noValidate onSubmit={onSubmit} spacing={5} aria-label="Sign up">
      {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
      <TextField
        label="Name"
        autoComplete="name"
        hint={`${LENGTH.displayName.min} to ${LENGTH.displayName.max} characters`}
        {...field('displayName')}
      />
      <TextField label="Email" type="email" autoComplete="email" {...field('email')} />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD.min} characters`}
        {...field('password')}
      />
      <Button type="submit" tone="primary" size="large" loading={isSubmitting}>
        Create account
      </Button>
    </Stack>
  );
}
