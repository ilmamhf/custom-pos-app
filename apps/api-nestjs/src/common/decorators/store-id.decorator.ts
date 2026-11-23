import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

/**
 * Returns the canonical store id resolved by `StoreAccessGuard`.
 *
 * Never read a second client-supplied store field directly: the guard has
 * already reconciled and authorized this value.
 */
export const StoreId = createParamDecorator(
  (required: boolean = false, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const storeId = request.storeId as string | undefined;

    if (required && !storeId) {
      throw new BadRequestException(
        'Store context is required (missing X-Store-Id or storeId parameter)',
      );
    }

    return storeId;
  },
);
