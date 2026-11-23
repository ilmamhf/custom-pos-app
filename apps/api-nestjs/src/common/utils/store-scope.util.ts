import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../decorators/current-user.decorator';

/**
 * Resolved server-side store scope for a request.
 *
 * - `all` is only ever true for an OWNER who did not request a specific store.
 * - Otherwise `storeIds` is the exhaustive set the caller may touch.
 */
export interface StoreScope {
  all: boolean;
  storeIds: string[];
  storeId?: string;
}

export function isOwner(user: RequestUser): boolean {
  return user.role === Role.OWNER;
}

/**
 * Turn a caller + an optional requested store into an enforceable scope.
 *
 * Default-deny: a non-owner with no store assignment cannot read anything.
 */
export function resolveStoreScope(
  user: RequestUser,
  requestedStoreId?: string,
): StoreScope {
  if (isOwner(user)) {
    return requestedStoreId
      ? { all: false, storeIds: [requestedStoreId], storeId: requestedStoreId }
      : { all: true, storeIds: [] };
  }

  const assigned = user.assignedStoreIds ?? [];

  if (requestedStoreId) {
    if (!assigned.includes(requestedStoreId)) {
      throw new ForbiddenException(
        `Access to store ${requestedStoreId} is denied`,
      );
    }
    return {
      all: false,
      storeIds: [requestedStoreId],
      storeId: requestedStoreId,
    };
  }

  if (assigned.length === 0) {
    throw new ForbiddenException('No store is assigned to this account');
  }

  return { all: false, storeIds: assigned };
}

/**
 * Prisma `where` fragment that restricts a store-scoped model.
 */
export function storeScopeWhere(scope: StoreScope): Record<string, unknown> {
  if (scope.all) return {};
  if (scope.storeId) return { storeId: scope.storeId };
  return { storeId: { in: scope.storeIds } };
}

/**
 * Whether a concrete record belongs to the scope. Used after loading an object
 * by UUID so direct-ID access cannot bypass list scoping.
 */
export function assertStoreInScope(scope: StoreScope, storeId: string): void {
  if (scope.all) return;
  if (!scope.storeIds.includes(storeId)) {
    throw new ForbiddenException(`Access to store ${storeId} is denied`);
  }
}
