import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { Role } from '@taskloom/contracts';
import { RoleSelect } from '../components/RoleSelect';

function Demo({ disabled = false }: { disabled?: boolean }) {
  const [role, setRole] = useState<Role>('MEMBER');
  return <RoleSelect value={role} onChange={setRole} disabled={disabled} />;
}

const meta = { title: 'Members/RoleSelect', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const Disabled: StoryObj<typeof meta> = { args: { disabled: true } };
