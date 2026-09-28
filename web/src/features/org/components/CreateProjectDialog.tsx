import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { ErrorCode, LENGTH, PROJECT_KEY_PATTERN } from '@taskloom/contracts';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorCode } from '../../../app/apollo';
import { Button, Dialog, TextField } from '../../../design-system';
import { messageFor } from '../../../lib/error-messages';
import { CreateProjectDocument, OrgProjectsDocument } from '../../../generated/graphql';
import { useOrgMutation } from '../hooks/useOrgOperation';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(LENGTH.projectName.min, 'Enter a name')
    .max(LENGTH.projectName.max, `Use at most ${LENGTH.projectName.max} characters`),
  key: z
    .string()
    .trim()
    .regex(
      PROJECT_KEY_PATTERN,
      'Three characters: a capital letter, then capital letters or digits',
    ),
  description: z
    .string()
    .trim()
    .max(LENGTH.projectDescription.max, `Use at most ${LENGTH.projectDescription.max} characters`),
});
type Values = z.infer<typeof schema>;

export interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: CreateProjectDialogProps) {
  const [createProject] = useOrgMutation(CreateProjectDocument);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', key: '', description: '' },
  });

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createProject({
        variables: {
          input: {
            name: values.name,
            key: values.key,
            description: values.description === '' ? null : values.description,
          },
        },
        // The list is sorted by name on the server; refetching keeps that order.
        refetchQueries: [OrgProjectsDocument],
        awaitRefetchQueries: true,
      });
      close();
    } catch (error) {
      const code = errorCode(error);
      if (code === ErrorCode.PROJECT_KEY_TAKEN) {
        setError(
          'key',
          { message: 'Another project already uses this key' },
          { shouldFocus: true },
        );
      } else {
        setError('root.server', { message: messageFor(code) });
      }
    }
  });

  const field = (name: keyof Values) => {
    const { ref, ...rest } = register(name);
    return { inputRef: ref, ...rest, errorText: errors[name]?.message };
  };
  const key = register('key');

  return (
    <Dialog
      open={open}
      title="New project"
      onClose={close}
      busy={isSubmitting}
      actions={
        <>
          <Button onClick={close} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" form="create-project" loading={isSubmitting}>
            Create project
          </Button>
        </>
      }
    >
      <Stack
        component="form"
        id="create-project"
        noValidate
        onSubmit={onSubmit}
        spacing={5}
        sx={{ pt: 1 }}
      >
        {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
        <TextField label="Name" autoFocus {...field('name')} />
        <TextField
          label="Key"
          hint="Three characters, for task ids like ENG-12"
          inputRef={key.ref}
          name={key.name}
          onBlur={key.onBlur}
          onChange={(event) => {
            event.target.value = event.target.value.toUpperCase();
            void key.onChange(event);
          }}
          errorText={errors.key?.message}
          slotProps={{ htmlInput: { maxLength: 3, autoCapitalize: 'characters' } }}
        />
        <TextField label="Description (optional)" multiline minRows={3} {...field('description')} />
      </Stack>
    </Dialog>
  );
}
