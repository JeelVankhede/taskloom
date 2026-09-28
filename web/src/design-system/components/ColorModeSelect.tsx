import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined';
import { useColorScheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';

type Mode = 'light' | 'system' | 'dark';

const OPTIONS: { mode: Mode; label: string; icon: React.ReactElement }[] = [
  { mode: 'light', label: 'Light theme', icon: <LightModeOutlined fontSize="small" /> },
  { mode: 'system', label: 'System theme', icon: <SettingsBrightnessOutlined fontSize="small" /> },
  { mode: 'dark', label: 'Dark theme', icon: <DarkModeOutlined fontSize="small" /> },
];

/** Light, dark, or follow the system. Remembered per browser; it is not an account setting. */
export function ColorModeSelect() {
  const { mode, setMode } = useColorScheme();
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      aria-label="Color theme"
      value={mode ?? 'system'}
      onChange={(_event, next: Mode | null) => next && setMode(next)}
    >
      {OPTIONS.map((option) => (
        <Tooltip key={option.mode} title={option.label}>
          <ToggleButton value={option.mode} aria-label={option.label}>
            {option.icon}
          </ToggleButton>
        </Tooltip>
      ))}
    </ToggleButtonGroup>
  );
}
