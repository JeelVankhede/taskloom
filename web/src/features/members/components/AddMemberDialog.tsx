import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { EMAIL_PATTERN, ErrorCode, normalizeEmail } from '@taskloom/contracts';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorCode } from '../../../app/apollo';
import { Button, Dialog, TextField } from '../../../design-system';
import {
  AddMemberDocument,
  OrgMembersDocument,
  PendingJoinRequestsDocument,
} from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';
import { useOrgMutation } from '../../org/hooks/useOrgOperation';
import { RoleSelect } from './RoleSelect';

const schema = z.object({
  email: z
    .string()
    .transform(normalizeEmail)
    .refine((v) => EMAIL_PATTERN.test(v), 'Enter a valid email address'),
  role: z.enum(['ADMIN', 'MEMBER', 'CONTRIBUTOR']),
});
type Input = z.input<typeof schema>;
type Values = z.output<typeof schema>;

const EMAIL_ERRORS: Partial<Record<string, string>> = {
  [ErrorCode.NOT_FOUND]: 'No account uses this email. They need to sign up first.',
  [ErrorCode.ALREADY_MEMBER]: 'This person is already a member.',
};

export interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Add an existing account by exact email. A pending request from them is approved too. */
export function AddMemberDialog({ open, onClose }: AddMemberDialogProps) {
  const [addMember] = useOrgMutation(AddMemberDocument);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Input, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: 'MEMBER' },
  });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addMember({
        variables: values,
        refetchQueries: [OrgMembersDocument, PendingJoinRequestsDocument],
        awaitRefetchQueries: true,
      });
      close();
    } catch (error) {
      const code = errorCode(error);
      const emailMessage = code ? EMAIL_ERRORS[code] : undefined;
      if (emailMessage) setError('email', { message: emailMessage }, { shouldFocus: true });
      else if (code === ErrorCode.RATE_LIMITED) {
        setError('root.server', {
          message: 'Too many lookups for this organization. Try again in an hour.',
        });
      } else setError('root.server', { message: messageFor(code) });
    }
  });

  const { ref, ...email } = register('email');
  return (
    <Dialog
      open={open}
      title="Add member"
      onClose={close}
      busy={isSubmitting}
      actions={
        <>
          <Button onClick={close} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" form="add-member" loading={isSubmitting}>
            Add member
          </Button>
        </>
      }
    >
      <Stack
        component="form"
        id="add-member"
        noValidate
        onSubmit={onSubmit}
        spacing={5}
        sx={{ pt: 1 }}
      >
        {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoFocus
          inputRef={ref}
          {...email}
          errorText={errors.email?.message}
          hint="The email of an existing Taskloom account"
        />
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <RoleSelect value={field.value} onChange={field.onChange} size="medium" />
          )}
        />
      </Stack>
    </Dialog>
  );
}
