import { Module } from '@nestjs/common';
import { LabelResolver } from './label.resolver.js';

@Module({ providers: [LabelResolver] })
export class LabelModule {}
