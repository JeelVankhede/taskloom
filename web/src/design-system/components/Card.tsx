import MuiCard from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

export interface CardProps {
  title?: string;
  children?: ReactNode;
  /** Makes the whole card one button. */
  onClick?: () => void;
  /** Makes the whole card one link to this in-app path (for example, a project board). */
  to?: string;
}

export function Card({ title, children, onClick, to }: CardProps) {
  const body = (
    <CardContent sx={{ p: 5, '&:last-child': { pb: 5 } }}>
      {title && (
        <Typography variant="h4" component="h3" gutterBottom={Boolean(children)}>
          {title}
        </Typography>
      )}
      {children}
    </CardContent>
  );
  if (to) {
    return (
      <MuiCard>
        <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
          {body}
        </CardActionArea>
      </MuiCard>
    );
  }
  return (
    <MuiCard>{onClick ? <CardActionArea onClick={onClick}>{body}</CardActionArea> : body}</MuiCard>
  );
}
