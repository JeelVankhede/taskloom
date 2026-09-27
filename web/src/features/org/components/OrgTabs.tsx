import Badge from '@mui/material/Badge';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Capability } from '@taskloom/contracts';
import { Link, useMatch } from 'react-router';
import { PendingJoinRequestsDocument } from '../../../generated/graphql';
import { PENDING_PAGE } from '../../members/pagination';
import { useOrgQuery } from '../hooks/useOrgOperation';
import { useOrg } from '../org-context';
import { can } from '../roles';

/** Dashboard and Members. Owners and admins see how many join requests wait for them. */
export function OrgTabs() {
  const org = useOrg();
  const membersTab = useMatch('/o/:orgSlug/members');
  const manager = can(org.role, Capability.MANAGE_ORG);
  const { data } = useOrgQuery(
    PendingJoinRequestsDocument,
    { first: PENDING_PAGE },
    { skip: !manager },
  );
  const pending = data?.organization.joinRequests;
  const count = pending?.edges.length ?? 0;
  const badge = pending?.pageInfo.hasNextPage ? `${count}+` : count;

  return (
    <Tabs
      value={membersTab ? 'members' : 'dashboard'}
      aria-label="Organization sections"
      sx={{ mb: 6, borderBottom: 1, borderColor: 'divider' }}
    >
      <Tab label="Dashboard" value="dashboard" component={Link} to={`/o/${org.slug}`} />
      <Tab
        value="members"
        component={Link}
        to={`/o/${org.slug}/members`}
        label={
          count > 0 ? (
            <Badge badgeContent={badge} color="secondary" sx={{ pr: 3 }}>
              <span>Members</span>
            </Badge>
          ) : (
            'Members'
          )
        }
        aria-label={count > 0 ? `Members, ${badge} pending join requests` : 'Members'}
      />
    </Tabs>
  );
}
