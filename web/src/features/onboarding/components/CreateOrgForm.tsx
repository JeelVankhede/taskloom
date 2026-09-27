import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { ErrorCode, LENGTH } from '@taskloom/contracts';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { useMutation } from '@apollo/client/react';
import { errorCode } from '../../../app/apollo';
import { Button, TextField } from '../../../design-system';
import { CreateOrganizationDocument, ViewerDocument } from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';
import { isValidSlug, SLUG_RULE, suggestSlug } from '../slug';
import { browserTimezone } from '../timezones';
import { TimezoneField } from './TimezoneField';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(LENGTH.orgName.min, 'Enter a name')
    .max(LENGTH.orgName.max, `Use at most ${LENGTH.orgName.max} characters`),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidSlug, `Use ${SLUG_RULE}; some words are reserved`),
  timezone: z.string().min(1, 'Choose a timezone'),
});
type Values = z.infer<typeof schema>;

/** Create an organization; the creator becomes its owner and lands on its dashboard. */
export function CreateOrgForm() {
  const navigate = useNavigate();
  const [createOrganization] = useMutation(CreateOrganizationDocument);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', timezone: browserTimezone() },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { data } = await createOrganization({
        variables: { input: values },
        // The switcher and the org route read the viewer's memberships.
        refetchQueries: [ViewerDocument],
        awaitRefetchQueries: true,
      });
      if (data) await navigate(`/o/${data.createOrganization.slug}`);
    } catch (error) {
      const code = errorCode(error);
      if (code === ErrorCode.VALIDATION_FAILED) {
        // Name and slug are checked here with the API's own rules, so the one field the server
        // can still reject is the timezone (the database checks it against its zone list).
        setError('timezone', { message: 'This timezone is not supported. Choose another.' });
      } else if (code === ErrorCode.ORG_SLUG_TAKEN) {
        setError('slug', { message: 'This slug is taken. Try another.' }, { shouldFocus: true });
      } else if (code === ErrorCode.RATE_LIMITED) {
        setError('root.server', {
          message: 'You have created several organizations today. Try again tomorrow.',
        });
      } else {
        setError('root.server', { message: messageFor(code) });
      }
    }
  });

  const name = register('name');
  const slug = register('slug');

  return (
    <Stack
      component="form"
      noValidate
      onSubmit={onSubmit}
      spacing={5}
      aria-label="Create an organization"
    >
      {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
      <TextField
        label="Organization name"
        inputRef={name.ref}
        name={name.name}
        onBlur={name.onBlur}
        onChange={(event) => {
          void name.onChange(event);
          // Suggest a slug from the name until the user edits the slug themselves.
          if (!getFieldState('slug').isDirty) setValue('slug', suggestSlug(event.target.value));
        }}
        errorText={errors.name?.message}
      />
      <TextField
        label="Slug"
        hint={`Your address: /o/slug. ${SLUG_RULE}.`}
        inputRef={slug.ref}
        name={slug.name}
        onBlur={slug.onBlur}
        onChange={slug.onChange}
        errorText={errors.slug?.message}
        slotProps={{ htmlInput: { maxLength: 6, autoCapitalize: 'none', spellCheck: false } }}
      />
      <Controller
        control={control}
        name="timezone"
        render={({ field, fieldState }) => (
          <TimezoneField
            value={field.value}
            onChange={field.onChange}
            errorText={fieldState.error?.message}
          />
        )}
      />
      <Button type="submit" tone="primary" loading={isSubmitting}>
        Create organization
      </Button>
    </Stack>
  );
}
