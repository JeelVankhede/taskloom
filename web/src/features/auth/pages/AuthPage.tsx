import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink, useLocation } from 'react-router';

interface AuthPageProps {
  title: string;
  children: ReactNode;
  switchPrompt: string;
  switchLabel: string;
  switchTo: '/signin' | '/signup';
}

/** The frame around the sign-in and sign-up forms. Keeps ?next= when switching between them. */
export function AuthPage({ title, children, switchPrompt, switchLabel, switchTo }: AuthPageProps) {
  const { search } = useLocation();
  return (
    <Container component="main" maxWidth="xs" sx={{ py: { xs: 10, sm: 20 } }}>
      <Typography variant="h3" component="p" color="primary" sx={{ mb: 6, textAlign: 'center' }}>
        Taskloom
      </Typography>
      <Card>
        <CardContent sx={{ p: { xs: 6, sm: 8 } }}>
          <Typography variant="h2" component="h1" sx={{ mb: 6 }}>
            {title}
          </Typography>
          {children}
        </CardContent>
      </Card>
      <Typography variant="body2" sx={{ mt: 5, textAlign: 'center' }}>
        {switchPrompt}{' '}
        <Link component={RouterLink} to={{ pathname: switchTo, search }}>
          {switchLabel}
        </Link>
      </Typography>
    </Container>
  );
}
