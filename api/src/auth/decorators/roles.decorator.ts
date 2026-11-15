import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export enum UserRole {
  BUYER = 'BUYER',
  SUPPLIER = 'SUPPLIER',
  ADMIN = 'ADMIN',
}

export const Roles = (...roles: UserRole[]) =>
  SetMetadata(ROLES_KEY, roles);