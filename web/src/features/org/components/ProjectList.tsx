import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Button, Card } from '../../../design-system';
import type { ProjectCardFieldsFragment } from '../../../generated/graphql';

export interface ProjectListProps {
  orgSlug: string;
  projects: ProjectCardFieldsFragment[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** Project cards, each a link to its board. */
export function ProjectList({
  orgSlug,
  projects,
  hasMore,
  loadingMore,
  onLoadMore,
}: ProjectListProps) {
  return (
    <Stack spacing={6}>
      <Grid>
        {projects.map((project) => (
          <Card key={project.id} title={project.name} to={`/o/${orgSlug}/p/${project.key}`}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {project.key}
            </Typography>
            {project.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {project.description}
              </Typography>
            )}
          </Card>
        ))}
      </Grid>
      {hasMore && (
        <Box>
          <Button onClick={onLoadMore} loading={loadingMore}>
            Load more projects
          </Button>
        </Box>
      )}
    </Stack>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 4,
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
      }}
    >
      {children}
    </Box>
  );
}
