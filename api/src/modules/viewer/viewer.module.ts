import { Module } from '@nestjs/common';
import { ViewerRepository } from './viewer.repository.js';
import { ViewerResolver } from './viewer.resolver.js';

@Module({ providers: [ViewerRepository, ViewerResolver] })
export class ViewerModule {}
