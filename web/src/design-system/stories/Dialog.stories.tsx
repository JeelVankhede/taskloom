import Typography from '@mui/material/Typography';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { TextField } from '../components/TextField';

function DialogDemo({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        title="Create project"
        busy={busy}
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button tone="primary" loading={busy}>
              Create
            </Button>
          </>
        }
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Projects hold tasks and their statuses.
        </Typography>
        <TextField label="Project name" autoFocus />
      </Dialog>
    </>
  );
}

const meta = { title: 'Design system/Dialog', component: DialogDemo } satisfies Meta<
  typeof DialogDemo
>;
export default meta;
export const Open: StoryObj<typeof meta> = {};
export const Busy: StoryObj<typeof meta> = { args: { busy: true } };
