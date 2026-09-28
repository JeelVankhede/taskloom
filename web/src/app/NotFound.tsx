import Container from '@mui/material/Container';
import { Button, EmptyState } from '../design-system';

export function NotFound() {
  return (
    <Container component="main" maxWidth="sm">
      <EmptyState
        title="Page not found"
        description="This address does not match any page in Taskloom."
        action={
          <Button tone="primary" to="/">
            Go home
          </Button>
        }
      />
    </Container>
  );
}
