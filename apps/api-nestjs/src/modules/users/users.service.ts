import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { hashPassword, hashPin } from '../../common/utils/hash.util';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        // The PIN is hashed, so the Admin cannot read it back. It only needs
        // to know whether one is set: a manager without a PIN cannot
        // authorize a refund.
        pinHash: true,
        userStores: {
          select: {
            storeId: true,
            store: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return users.map((user) => this.withStoresAlias(user));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        pinHash: true,
        userStores: {
          select: {
            storeId: true,
            store: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.withStoresAlias(user);
  }

  /**
   * React Admin consumes `stores`; the API historically returned `userStores`.
   * Return both so neither contract breaks.
   *
   * The PIN hash never leaves the service. It is reduced to a boolean, because
   * the Admin has to know whether a manager has a PIN set without being able
   * to read it.
   */
  private withStoresAlias<T extends {
    pinHash: string | null;
    userStores: Array<{ storeId: string; store: { id: string; name: string; code: string } }>;
  }>(user: T) {
    const { pinHash, ...rest } = user;

    return {
      ...rest,
      hasPin: !!pinHash,
      stores: user.userStores.map((us) => ({
        storeId: us.storeId,
        store: { id: us.store.id, name: us.store.name, code: us.store.code },
      })),
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }

    const passwordHash = await hashPassword(dto.password);
    const pinHash = dto.pin ? await hashPin(dto.pin) : null;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          pinHash,
          role: dto.role,
          isActive: true,
        },
      });

      if (dto.storeIds && dto.storeIds.length > 0) {
        await tx.userStore.createMany({
          data: dto.storeIds.map((storeId) => ({
            userId: user.id,
            storeId,
          })),
          skipDuplicates: true,
        });
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      };
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);

    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim();
      const conflict = await this.prisma.user.findUnique({ where: { email } });
      if (conflict && conflict.id !== id) {
        throw new ConflictException(`User with email ${dto.email} already exists`);
      }
    }

    await this.assertOwnerRemains(existing, dto);

    const updateData: Record<string, any> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email.toLowerCase().trim();
    if (dto.role !== undefined) updateData.role = dto.role;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.password) updateData.passwordHash = await hashPassword(dto.password);
    if (dto.pin) updateData.pinHash = await hashPin(dto.pin);

    return this.prisma.$transaction(async (tx) => {
      if (dto.storeIds !== undefined) {
        await tx.userStore.deleteMany({ where: { userId: id } });
        if (dto.storeIds.length > 0) {
          await tx.userStore.createMany({
            data: dto.storeIds.map((storeId) => ({
              userId: id,
              storeId,
            })),
            skipDuplicates: true,
          });
        }
      }

      const updated = await tx.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          pinHash: true,
          userStores: {
            select: {
              storeId: true,
              store: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      });

      // The same shape as the list and the detail endpoint, so the Admin
      // gets the branch assignment and the PIN flag it expects.
      return this.withStoresAlias(updated);
    });
  }

  /**
   * Refuses to leave the deployment without an owner.
   *
   * The staff directory is owner-only: with every owner demoted or
   * deactivated, nobody can reach it any more, and the accounts below are
   * locked out of their branches as well. The rule is "at least one other
   * active owner has to remain", which leaves a hand-over between two owners
   * possible.
   */
  private async assertOwnerRemains(
    user: { id: string; role: Role; isActive: boolean },
    dto: UpdateUserDto,
  ): Promise<void> {
    const keepsOwnerRole = dto.role === undefined || dto.role === Role.OWNER;
    const keepsActive = dto.isActive === undefined || dto.isActive === true;

    // Only an edit that turns an active owner into something else can leave
    // the deployment without one.
    if (user.role !== Role.OWNER || !user.isActive || (keepsOwnerRole && keepsActive)) {
      return;
    }

    const otherActiveOwners = await this.prisma.user.count({
      where: {
        role: Role.OWNER,
        isActive: true,
        NOT: { id: user.id },
      },
    });

    if (otherActiveOwners === 0) {
      throw new BadRequestException(
        'The last active owner cannot be demoted or deactivated',
      );
    }
  }
}
