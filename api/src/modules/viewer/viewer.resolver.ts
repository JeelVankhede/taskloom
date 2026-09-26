import { Query, Resolver } from '@nestjs/graphql';
import { notFound } from '../../platform/errors/domain-error.js';
import { ViewerRepository, type ViewerRow } from './viewer.repository.js';

@Resolver('Viewer')
export class ViewerResolver {
  constructor(private readonly viewers: ViewerRepository) {}

  @Query('viewer')
  async viewer(): Promise<ViewerRow> {
    const viewer = await this.viewers.findSelf();
    if (!viewer) throw notFound('user');
    return viewer;
  }
}
