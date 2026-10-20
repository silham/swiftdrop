import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type Role } from '@swiftdrop/contracts';
import type { Prisma, User } from '@swiftdrop/db';
import * as argon2 from 'argon2';
import type { AuthUser } from '../../common/auth';
import { AppError, notFound } from '../../common/errors/app-error';
import { paginated } from '../../common/pagination/pagination';
import { PrismaService } from '../../infra/prisma';
import { AuditService } from '../audit';
import type {
  AdminCreateUserDto,
  AdminUpdateUserDto,
  ListUsersQuery,
  UpdateMeDto,
  UserDto,
} from './dto/user.dto';

export interface CreateUserInput {
  email: string;
  name: string;
  role: Role;
  /** Plain password — hashed here with argon2id. Omit for OAuth-only users. */
  password?: string;
  phone?: string;
}

/**
 * PUBLIC SERVICE (exported) — other modules may call: findById, findByEmail, createUser, toDto.
 * Owner: M2.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  }

  async getMe(userId: string): Promise<UserDto> {
    const user = await this.findById(userId);
    if (!user) throw notFound('User');
    return this.toDto(user);
  }

  /** Used by auth registration (M2) and merchant registration (M5). */
  async createUser(input: CreateUserInput): Promise<User> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new AppError(
        ERROR_CODES.EMAIL_TAKEN,
        'An account with this email already exists',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = input.password
      ? await argon2.hash(input.password, { type: argon2.argon2id })
      : null;

    return this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        phone: input.phone?.trim() ?? null,
        role: input.role,
        passwordHash,
      },
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<UserDto> {
    const user = await this.findById(userId);
    if (!user) throw notFound('User');

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone.trim() || null;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.toDto(updated);
  }

  async adminList(q: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {};
    if (q.role) {
      where.role = q.role;
    }
    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: q.skip,
        take: q.take,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return paginated(
      users.map((u) => this.toDto(u)),
      total,
      q,
    );
  }

  async adminCreate(dto: AdminCreateUserDto, actor?: AuthUser): Promise<UserDto> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new AppError(
        ERROR_CODES.EMAIL_TAKEN,
        'An account with this email already exists',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          phone: dto.phone?.trim() ?? null,
          role: dto.role,
          passwordHash,
        },
      });

      if (dto.role === 'COURIER') {
        await tx.courierProfile.create({
          data: {
            userId: created.id,
          },
        });
      }

      await this.audit.record(
        {
          actor: actor ? { id: actor.id, role: actor.role } : null,
          action: 'user.created',
          entityType: 'User',
          entityId: created.id,
          metadata: { role: created.role, email: created.email },
        },
        tx,
      );

      return created;
    });

    return this.toDto(user);
  }

  async adminUpdate(id: string, dto: AdminUpdateUserDto, actor?: AuthUser): Promise<UserDto> {
    const user = await this.findById(id);
    if (!user) throw notFound('User');

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.UserUpdateInput = {};
      if (dto.role !== undefined) data.role = dto.role;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      const u = await tx.user.update({
        where: { id },
        data,
      });

      if (dto.isActive === false) {
        await tx.refreshSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      const action =
        dto.role !== undefined && dto.isActive !== undefined
          ? 'user.updated'
          : dto.role !== undefined
            ? 'user.role_changed'
            : 'user.status_changed';

      await this.audit.record(
        {
          actor: actor ? { id: actor.id, role: actor.role } : null,
          action,
          entityType: 'User',
          entityId: id,
          metadata: {
            previousRole: user.role,
            newRole: dto.role ?? user.role,
            previousIsActive: user.isActive,
            newIsActive: dto.isActive ?? user.isActive,
          },
        },
        tx,
      );

      return u;
    });

    return this.toDto(updated);
  }

  toDto(u: User): UserDto {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
    };
  }
}
