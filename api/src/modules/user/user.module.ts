import { Module } from '@nestjs/common';
import { UserResolver } from './user.resolver.js';

@Module({ providers: [UserResolver] })
export class UserModule {}
