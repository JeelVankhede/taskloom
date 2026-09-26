import { Module } from '@nestjs/common';
import { OrganizationRepository } from './organization.repository.js';
import { OrganizationResolver } from './organization.resolver.js';

@Module({ providers: [OrganizationRepository, OrganizationResolver] })
export class OrganizationModule {}
