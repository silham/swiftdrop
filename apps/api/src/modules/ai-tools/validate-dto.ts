import { HttpStatus } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { AppError } from '../../common/errors/app-error';

/**
 * Runs the same class-validator rules the HTTP endpoint uses, so a tool call can't skip validation
 * (rule 4) and the rules aren't written twice. Returns a real instance (getters like `skip` work).
 */
export async function validateDto<T extends object>(
  cls: ClassConstructor<T>,
  input: object,
): Promise<T> {
  const instance = plainToInstance(cls, input);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    const fields = errors.map((e) => e.property).join(', ');
    throw new AppError('VALIDATION_FAILED', `Invalid input: ${fields}`, HttpStatus.BAD_REQUEST);
  }
  return instance;
}
