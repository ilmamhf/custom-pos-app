import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
   */
  private withStoresAlias<T extends { userStores: Array<{ storeId: string; store: { id: string; name: string; code: string } }> }>(
    user: T,
  ) {
    return {
      ...user,
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
    await this.findOne(id);

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
        },
      });

      return updated;
    });
  }
}
