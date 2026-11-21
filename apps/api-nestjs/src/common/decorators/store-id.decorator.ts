import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const StoreId = createParamDecorator(
  (required: boolean = false, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const headerStoreId = request.headers['x-store-id'];
    const paramStoreId = request.params?.storeId;
    const queryStoreId = request.query?.storeId;
    const bodyStoreId = request.body?.storeId;

    const storeId = (headerStoreId || paramStoreId || queryStoreId || bodyStoreId) as string | undefined;

    if (required && !storeId) {
      throw new BadRequestException('Store context is required (missing X-Store-Id or storeId parameter)');
    }

    return storeId;
  },
);
