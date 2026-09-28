import { useMutation } from '@apollo/client/react';
import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { ErrorCode, ORG_SLUG_PATTERN } from '@taskloom/contracts';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorCode } from '../../../app/apollo';
import { Button, TextField } from '../../../design-system';
import {
  RequestToJoinOrganizationDocument,
  ViewerJoinRequestsDocument,
} from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';

const schema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(ORG_SLUG_PATTERN, 'Enter the slug from the address, like acme'),
});
type Values = z.infer<typeof schema>;

const FIELD_ERRORS: Partial<Record<string, string>> = {
  [ErrorCode.NOT_FOUND]: 'No organization has this slug',
  [ErrorCode.ALREADY_MEMBER]: 'You are already a member of this organization',
  [ErrorCode.JOIN_REQUEST_PENDING]: 'You already asked to join. Its owners and admins will decide.',
};

/** Ask the owners and admins of an organization to let you in. */
export function JoinOrgForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [requestToJoin] = useMutation(RequestToJoinOrganizationDocument);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { slug: '' } });

  const onSubmit = handleSubmit(async ({ slug }) => {
    setSentTo(null);
    try {
      const { data } = await requestToJoin({
        variables: { slug },
        refetchQueries: [ViewerJoinRequestsDocument],
      });
      reset();
      setSentTo(data?.requestToJoinOrganization.organization.name ?? slug);
    } catch (error) {
      const code = errorCode(error);
      const fieldMessage = code ? FIELD_ERRORS[code] : undefined;
      if (fieldMessage) setError('slug', { message: fieldMessage }, { shouldFocus: true });
      else if (code === ErrorCode.RATE_LIMITED) {
        setError('root.server', { message: 'You have sent many requests. Try again in an hour.' });
      } else setError('root.server', { message: messageFor(code) });
    }
  });

  const { ref, ...slug } = register('slug');
  return (
    <Stack
      component="form"
      noValidate
      onSubmit={onSubmit}
      spacing={5}
      aria-label="Join an organization"
    >
      {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
      {sentTo && (
        <Alert severity="success" role="status">
          Request sent to {sentTo}. You will get access once an owner or admin approves it.
        </Alert>
      )}
      <TextField
        label="Organization slug"
        hint="Ask a member for it: it is the part after /o/ in their address"
        inputRef={ref}
        {...slug}
        errorText={errors.slug?.message}
        slotProps={{ htmlInput: { maxLength: 6, autoCapitalize: 'none', spellCheck: false } }}
      />
      <Button type="submit" loading={isSubmitting}>
        Request to join
      </Button>
    </Stack>
  );
}
