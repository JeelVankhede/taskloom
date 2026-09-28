import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ErrorCode, LENGTH, type Priority } from '@taskloom/contracts';
import dayjs from 'dayjs';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorCode } from '../../../app/apollo';
import { Button, Dialog, PRIORITY_LABEL, TextField } from '../../../design-system';
import { CreateTaskDocument, type TaskCardFieldsFragment } from '../../../generated/graphql';
import { messageFor } from '../../../lib/error-messages';
import { useOrgMutation } from '../../org/hooks/useOrgOperation';
import { PRIORITIES } from '../filters';
import type { FilterOption } from './FilterBar';

const MAX_LABELS = 20;

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(LENGTH.taskTitle.min, 'Enter a title')
    .max(LENGTH.taskTitle.max, `Use at most ${LENGTH.taskTitle.max} characters`),
  description: z
    .string()
    .trim()
    .max(LENGTH.taskDescription.max, `Use at most ${LENGTH.taskDescription.max} characters`),
  /** '' is the project's default status. */
  statusId: z.string(),
  priority: z.enum(PRIORITIES as [Priority, ...Priority[]]),
  assigneeId: z.string().nullable(),
  dueDate: z
    .string({ error: 'Choose a due date' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date'),
  labelIds: z.array(z.string()).max(MAX_LABELS, `At most ${MAX_LABELS} labels`),
});
type Values = z.infer<typeof schema>;

/** API refusals and the field each belongs to. */
const FIELD_ERRORS: Partial<Record<string, [keyof Values, string]>> = {
  [ErrorCode.STATUS_ARCHIVED]: ['statusId', 'This status was archived. Choose another.'],
  [ErrorCode.STATUS_NOT_IN_PROJECT]: ['statusId', 'This status is not in the project.'],
  [ErrorCode.ASSIGNEE_INACTIVE]: ['assigneeId', 'This person was deactivated.'],
  [ErrorCode.ASSIGNEE_NOT_MEMBER]: ['assigneeId', 'This person is no longer a member.'],
  [ErrorCode.LABEL_ARCHIVED]: ['labelIds', 'A chosen label was archived. Remove it.'],
};

export interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  statuses: FilterOption[];
  assignees: FilterOption[];
  labels: FilterOption[];
  onCreated: (task: TaskCardFieldsFragment) => void;
}

export function NewTaskDialog(props: NewTaskDialogProps) {
  const { open, onClose, projectId, statuses, assignees, labels, onCreated } = props;
  const [createTask] = useOrgMutation(CreateTaskDocument);
  const empty: Values = {
    title: '',
    description: '',
    statusId: '',
    priority: 'NONE',
    assigneeId: null,
    dueDate: '',
    labelIds: [],
  };
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  const close = () => {
    reset(empty);
    onClose();
  };

  const onSubmit = handleSubmit(async (v) => {
    try {
      const { data } = await createTask({
        variables: {
          input: {
            projectId,
            title: v.title,
            description: v.description === '' ? null : v.description,
            ...(v.statusId ? { statusId: v.statusId } : {}),
            priority: v.priority,
            assigneeId: v.assigneeId,
            dueDate: v.dueDate,
            labelIds: v.labelIds,
          },
        },
      });
      if (data) onCreated(data.createTask);
      close();
    } catch (error) {
      const code = errorCode(error);
      const field = code ? FIELD_ERRORS[code] : undefined;
      if (field) setError(field[0], { message: field[1] });
      else if (code === ErrorCode.PROJECT_ARCHIVED) {
        setError('root.server', { message: 'This project was archived; it takes no new tasks.' });
      } else setError('root.server', { message: messageFor(code) });
    }
  });

  const text = (name: 'title' | 'description') => {
    const { ref, ...rest } = register(name);
    return { inputRef: ref, ...rest, errorText: errors[name]?.message };
  };

  return (
    <Dialog
      open={open}
      title="New task"
      onClose={close}
      busy={isSubmitting}
      actions={
        <>
          <Button onClick={close} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button tone="primary" type="submit" form="new-task" loading={isSubmitting}>
            Create task
          </Button>
        </>
      }
    >
      <Stack
        component="form"
        id="new-task"
        noValidate
        onSubmit={onSubmit}
        spacing={5}
        sx={{ pt: 1 }}
      >
        {errors.root?.server && <Alert severity="error">{errors.root.server.message}</Alert>}
        <TextField label="Title" autoFocus {...text('title')} />
        <TextField label="Description (optional)" multiline minRows={3} {...text('description')} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4}>
          <Controller
            control={control}
            name="statusId"
            render={({ field, fieldState }) => (
              <TextField
                select
                label="Status"
                {...field}
                errorText={fieldState.error?.message}
                // "Project default" is the empty value; show it rather than a blank field.
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">Project default</MenuItem>
                {statuses.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <TextField select label="Priority" {...field}>
                {PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4}>
          <Controller
            control={control}
            name="assigneeId"
            render={({ field, fieldState }) => (
              <Autocomplete
                options={assignees}
                value={assignees.find((a) => a.id === field.value) ?? null}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_e, value) => field.onChange(value?.id ?? null)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Assignee (optional)"
                    errorText={fieldState.error?.message}
                  />
                )}
                sx={{ flex: 1 }}
              />
            )}
          />
          <Controller
            control={control}
            name="dueDate"
            render={({ field, fieldState }) => (
              <DatePicker
                label="Due date"
                value={field.value ? dayjs(field.value) : null}
                onChange={(value) =>
                  field.onChange(value?.isValid() ? value.format('YYYY-MM-DD') : '')
                }
                slotProps={{
                  textField: {
                    size: 'small',
                    required: true,
                    error: Boolean(fieldState.error),
                    helperText: fieldState.error?.message,
                    sx: { flex: 1 },
                  },
                }}
              />
            )}
          />
        </Stack>
        <Controller
          control={control}
          name="labelIds"
          render={({ field, fieldState }) => (
            <Autocomplete
              multiple
              options={labels}
              value={labels.filter((l) => field.value.includes(l.id))}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_e, value) => field.onChange(value.map((v) => v.id))}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Labels (optional)"
                  errorText={fieldState.error?.message}
                  hint={`Up to ${MAX_LABELS}`}
                />
              )}
            />
          )}
        />
      </Stack>
    </Dialog>
  );
}
