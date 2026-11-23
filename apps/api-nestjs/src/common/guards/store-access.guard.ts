import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RequestUser } from '../decorators/current-user.decorator';

/**
 * Resolves one canonical store context for a request and authorizes it.
 *
 * Client-supplied store identifiers can arrive in several places. The guard
 * collects all of them, rejects any disagreement, authorizes the resulting
 * canonical value, and attaches it to the request so controllers and services
 * never have to trust a second client field.
 */
@Injectable()
export class StoreAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser = request.user;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    const candidates = this.collectStoreIds(request);
    const canonical = this.resolveCanonical(candidates);

    if (user.role === Role.OWNER) {
      request.storeId = canonical;
      request.storeScope = {
        all: !canonical,
        storeIds: canonical ? [canonical] : [],
        storeId: canonical,
      };
    } else {
      const assigned = user.assignedStoreIds ?? [];

      if (!canonical) {
        throw new BadRequestException(
          'Store context required: missing X-Store-Id header or storeId parameter',
        );
      }
      if (!assigned.includes(canonical)) {
        throw new ForbiddenException(`Access to store ${canonical} is denied`);
      }

      request.storeId = canonical;
      request.storeScope = {
        all: false,
        storeIds: [canonical],
        storeId: canonical,
      };
    }

    // Transfers name a distinct destination; it must also be authorized.
    const toStoreId = request.body?.toStoreId;
    if (typeof toStoreId === 'string' && toStoreId.length > 0) {
      if (user.role !== Role.OWNER && !(user.assignedStoreIds ?? []).includes(toStoreId)) {
        throw new ForbiddenException(
          `Access to destination store ${toStoreId} is denied`,
        );
      }
    }

    return true;
  }

  private collectStoreIds(request: any): string[] {
    const candidates: Array<string | undefined> = [
      this.first(request.headers?.['x-store-id']),
      this.first(request.params?.storeId),
      this.first(request.query?.storeId),
      this.first(request.body?.storeId),
      this.first(request.body?.fromStoreId),
    ];

    return candidates
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => value.trim());
  }

  private resolveCanonical(candidates: string[]): string | undefined {
    if (candidates.length === 0) return undefined;
    const [first, ...rest] = candidates;
    for (const value of rest) {
      if (value !== first) {
        throw new BadRequestException(
          'Conflicting store context: all store identifiers in a request must match',
        );
      }
    }
    return first;
  }

  private first(value: unknown): string | undefined {
    if (Array.isArray(value)) return value[0] as string | undefined;
    return typeof value === 'string' ? value : undefined;
  }
}
