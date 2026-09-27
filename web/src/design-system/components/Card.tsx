import MuiCard from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

export interface CardProps {
  title?: string;
  children?: ReactNode;
  /** Makes the whole card one button (for example, open a project). */
  onClick?: () => void;
}

export function Card({ title, children, onClick }: CardProps) {
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
  return (
    <MuiCard>{onClick ? <CardActionArea onClick={onClick}>{body}</CardActionArea> : body}</MuiCard>
  );
}
