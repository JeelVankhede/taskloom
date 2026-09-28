import AddOutlined from '@mui/icons-material/AddOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import UnfoldMoreOutlined from '@mui/icons-material/UnfoldMoreOutlined';
import MuiButton from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useId, useState } from 'react';
import { Link, useMatch } from 'react-router';
import { useViewer } from './useViewer';

/** Lists the viewer's organizations; the URL decides which one is current. */
export function OrgSwitcher() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const match = useMatch('/o/:orgSlug/*');
  const { data } = useViewer();
  const memberships = data?.viewer.memberships ?? [];
  const current = memberships.find((m) => m.organization.slug === match?.params.orgSlug);
  const close = () => setAnchor(null);

  return (
    <>
      <MuiButton
        color="inherit"
        endIcon={<UnfoldMoreOutlined fontSize="small" />}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ maxWidth: { xs: 160, sm: 260 }, justifyContent: 'space-between' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.organization.name ?? 'Select organization'}
        </span>
      </MuiButton>
      <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {memberships.map((m) => {
          const selected = m.organization.id === current?.organization.id;
          return (
            <MenuItem
              key={m.organization.id}
              component={Link}
              to={`/o/${m.organization.slug}`}
              selected={selected}
              onClick={close}
            >
              <ListItemIcon>{selected && <CheckOutlined fontSize="small" />}</ListItemIcon>
              <ListItemText primary={m.organization.name} secondary={m.organization.slug} />
            </MenuItem>
          );
        })}
        {memberships.length > 0 && <Divider />}
        <MenuItem component={Link} to="/onboarding" onClick={close}>
          <ListItemIcon>
            <AddOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Create or join an organization" />
        </MenuItem>
      </Menu>
    </>
  );
}
