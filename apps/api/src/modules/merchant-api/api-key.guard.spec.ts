import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, MERCHANT_API_KEY_HEADER } from '@swiftdrop/contracts';
import { AppError } from '../../common/errors/app-error';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let merchants: any;

  beforeEach(() => {
    merchants = {
      verifyApiKey: jest.fn(),
    };
    guard = new ApiKeyGuard(merchants);
  });

  function mockContext(headers: Record<string, string> = {}): {
    ctx: ExecutionContext;
    req: any;
  } {
    const req: any = {
      header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
    };
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    };
    return { ctx, req };
  }

  it('throws 401 INVALID_API_KEY when header is missing', async () => {
    const { ctx } = mockContext({});

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_API_KEY,
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('throws 401 INVALID_API_KEY when key verification fails', async () => {
    const { ctx } = mockContext({ [MERCHANT_API_KEY_HEADER]: 'sd_live_invalid' });
    merchants.verifyApiKey.mockResolvedValue(null);

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_API_KEY,
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('attaches req.merchantId and returns true on valid key', async () => {
    const { ctx, req } = mockContext({ [MERCHANT_API_KEY_HEADER]: 'sd_live_valid_key' });
    merchants.verifyApiKey.mockResolvedValue('merchant_abc');

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(req.merchantId).toBe('merchant_abc');
  });

  it('propagates 403 MERCHANT_NOT_APPROVED when merchant is not approved', async () => {
    const { ctx } = mockContext({ [MERCHANT_API_KEY_HEADER]: 'sd_live_pending_key' });
    merchants.verifyApiKey.mockRejectedValue(
      new AppError(ERROR_CODES.MERCHANT_NOT_APPROVED, 'Not approved', HttpStatus.FORBIDDEN),
    );

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      code: ERROR_CODES.MERCHANT_NOT_APPROVED,
      status: HttpStatus.FORBIDDEN,
    });
  });
});

