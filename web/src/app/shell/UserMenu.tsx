import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useId, useState } from 'react';
import { ColorModeSelect, UserChip } from '../../design-system';
import type { SessionUser } from '../../features/auth/session';
import { session } from '../../features/auth/session';

/** Who is signed in, the color theme, and sign out. */
export function UserMenu({ user }: { user: SessionUser }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();

  return (
    <>
      <IconButton
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <UserChip displayName={user.displayName} avatarOnly size="medium" />
      </IconButton>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 4, py: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user.displayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Box sx={{ px: 4, py: 2 }}>
          <ColorModeSelect />
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            // The request failing still signs out locally (session.signOut), so nothing to show.
            session
              .signOut()
              .catch((error: unknown) => console.error('Sign out request failed', error));
          }}
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
