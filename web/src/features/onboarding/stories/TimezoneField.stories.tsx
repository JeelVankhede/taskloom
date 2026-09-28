import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TimezoneField } from '../components/TimezoneField';

function Demo({ errorText }: { errorText?: string }) {
  const [zone, setZone] = useState('Asia/Kolkata');
  return (
    <div style={{ maxWidth: 360 }}>
      <TimezoneField value={zone} onChange={setZone} errorText={errorText} />
    </div>
  );
}

const meta = { title: 'Onboarding/TimezoneField', component: Demo } satisfies Meta<typeof Demo>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const WithError: StoryObj<typeof meta> = {
  args: { errorText: 'This timezone is not supported. Choose another.' },
};
