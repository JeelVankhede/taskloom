import { Injectable } from '@nestjs/common';
import { DbContext } from '../../platform/database/db-context.js';

export interface ViewerRow {
  id: string;
  email: string;
  displayName: string;
}

@Injectable()
export class ViewerRepository {
  constructor(private readonly db: DbContext) {}

  /** The users policy lets app_user read its own row in any context. */
  findSelf(): Promise<ViewerRow | null> {
    return this.db.tx.user.findUnique({
      where: { id: this.db.userId },
      select: { id: true, email: true, displayName: true },
    });
  }
}
