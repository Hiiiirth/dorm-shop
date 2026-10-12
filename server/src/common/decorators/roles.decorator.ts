import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../constants/enums';

export const ROLES_KEY = 'roles';

/**
 * 限定可访问的当前身份（current_role）
 * @example @Roles(UserRole.ADMIN) @Post('orders/:id/deliver')
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
