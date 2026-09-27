import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { EMAIL_PATTERN, ErrorCode, normalizeEmail } from '@taskloom/contracts';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, TextField } from '../../../design-system';
import { messageFor } from '../../../lib/error-messages';
import { AuthError, authApi } from '../api/auth-api';
import { session } from '../session';
import { PasswordField } from './PasswordField';

// Sign in checks only presence and email shape: password rules apply when an account is created,
// and a wrong password is INVALID_CREDENTIALS from the API.
const schema = z.object({
  email: z
    .string()
    .refine((v) => v.trim() !== '', 'Enter your email')
    .refine(
      (v) => v.trim() === '' || EMAIL_PATTERN.test(normalizeEmail(v)),
      'Enter a valid email address',
    ),
  password: z.string().min(1, 'Enter your password'),
});

type Values = z.infer<typeof schema>;

export function SignInForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      session.start(
        await authApi.signIn({ email: normalizeEmail(values.email), password: values.password }),
      );
    } catch (error) {
      const code = error instanceof AuthError ? error.code : undefined;
      setError('root.server', {
        message:
          code === ErrorCode.INVALID_CREDENTIALS
            ? 'Email or password is incorrect.'
            : messageFor(code),
      });
    }
  });

  const field = (name: keyof Values) => {
    const { ref, ...rest } = register(name);
    return { inputRef: ref, ...rest, errorText: errors[name]?.message };
  };

  return (
    <Stack component="form" noValidate onSubmit={onSubmit} spacing={5} aria-label="Sign in">
      {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
      <TextField label="Email" type="email" autoComplete="email" {...field('email')} />
      <PasswordField label="Password" autoComplete="current-password" {...field('password')} />
      <Button type="submit" tone="primary" size="large" loading={isSubmitting}>
        Sign in
      </Button>
    </Stack>
  );
}
