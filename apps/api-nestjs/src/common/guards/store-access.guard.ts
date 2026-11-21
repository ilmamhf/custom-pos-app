import { Injectable, CanActivate, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../decorators/current-user.decorator';

@Injectable()
export class StoreAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    // Owner has unrestricted access to all 1–3 stores
    if (user.role === Role.OWNER) {
      return true;
    }

    // Identify target storeId from headers, route params, query, or body
    const headerStoreId = request.headers['x-store-id'];
    const paramStoreId = request.params?.storeId || request.params?.id;
    const queryStoreId = request.query?.storeId;
    const bodyStoreId = request.body?.storeId || request.body?.fromStoreId;

    const targetStoreId = (headerStoreId || paramStoreId || queryStoreId || bodyStoreId) as string | undefined;

    if (!targetStoreId) {
      throw new BadRequestException('Store context required: missing X-Store-Id header or storeId parameter');
    }

    const hasStoreAccess = user.assignedStoreIds?.includes(targetStoreId);
    if (!hasStoreAccess) {
      throw new ForbiddenException(`Access to store ${targetStoreId} is denied`);
    }

    // If body contains toStoreId (e.g. transfer), verify access as well if user is not OWNER
    if (request.body?.toStoreId && !user.assignedStoreIds?.includes(request.body.toStoreId)) {
      throw new ForbiddenException(`Access to destination store ${request.body.toStoreId} is denied`);
    }

    return true;
  }
}
