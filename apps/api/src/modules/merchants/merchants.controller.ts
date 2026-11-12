import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth';
import {
  ApiKeyDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  CreateWebhookDto,
  ListMerchantsQuery,
  ListWebhookAttemptsQuery,
  ListMyMerchantParcelsQuery,
  MerchantDto,
  RegisterMerchantDto,
  RejectMerchantDto,
  UpdateWebhookDto,
  WebhookDto,
  WebhookWithSecretDto,
} from './dto/merchant.dto';
import { MerchantsService } from './merchants.service';

/** Owner: M5 — merchant PORTAL (cookie session). Partner API lives in merchant-api (X-Api-Key). */
@ApiTags('merchants')
@Controller('merchants')
@Roles('MERCHANT')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Post('register')
  @Public()
  // Public sign-up: stricter than the global limit (same idea as the auth routes).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Merchant sign-up (account starts PENDING approval)' })
  @ApiOkResponse({ type: MerchantDto })
  register(@Body() dto: RegisterMerchantDto) {
    return this.merchants.register(dto);
  }

  @Get('me')
  @ApiOkResponse({ type: MerchantDto })
  me(@CurrentUser() user: AuthUser) {
    return this.merchants.getMine(user);
  }

  @Get('me/api-keys')
  @ApiOkResponse({ type: [ApiKeyDto] })
  listKeys(@CurrentUser() user: AuthUser) {
    return this.merchants.listApiKeys(user);
  }

  @Post('me/api-keys')
  @ApiOkResponse({ type: CreatedApiKeyDto })
  createKey(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.merchants.createApiKey(user, dto);
  }

  @Delete('me/api-keys/:id')
  @HttpCode(204)
  revokeKey(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merchants.revokeApiKey(user, id);
  }

  @Get('me/webhooks')
  @ApiOkResponse({ type: [WebhookDto] })
  listWebhooks(@CurrentUser() user: AuthUser) {
    return this.merchants.listWebhooks(user);
  }

  @Post('me/webhooks')
  @ApiOkResponse({ type: WebhookWithSecretDto })
  createWebhook(@CurrentUser() user: AuthUser, @Body() dto: CreateWebhookDto) {
    return this.merchants.createWebhook(user, dto);
  }

  @Patch('me/webhooks/:id')
  @ApiOkResponse({ type: WebhookDto })
  updateWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.merchants.updateWebhook(user, id, dto);
  }

  @Delete('me/webhooks/:id')
  @HttpCode(204)
  deleteWebhook(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merchants.deleteWebhook(user, id);
  }

  @Post('me/webhooks/:id/rotate-secret')
  @HttpCode(200)
  @ApiOkResponse({ type: WebhookWithSecretDto })
  rotate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merchants.rotateWebhookSecret(user, id);
  }

  @Get('me/webhooks/:id/attempts')
  @ApiOperation({
    summary: 'Delivery attempts for an endpoint, newest first (total in X-Total-Count)',
  })
  async attempts(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() q: ListWebhookAttemptsQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, total } = await this.merchants.listWebhookAttempts(user, id, q);
    res.setHeader('X-Total-Count', String(total));
    return data;
  }

  @Get('me/parcels')
  @ApiOperation({ summary: 'List parcels for current merchant (session-based)' })
  myParcels(@CurrentUser() user: AuthUser, @Query() q: ListMyMerchantParcelsQuery) {
    return this.merchants.getMyParcels(user, q, q.status);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Get parcel status counts for merchant dashboard' })
  myStats(@CurrentUser() user: AuthUser) {
    return this.merchants.getMyStats(user);
  }
}

/** Owner: M5 — merchant approval (admin). */
@ApiTags('admin')
@Controller('admin/merchants')
@Roles('ADMIN')
export class MerchantsAdminController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get()
  list(@Query() q: ListMerchantsQuery) {
    return this.merchants.adminList(q);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOkResponse({ type: MerchantDto })
  approve(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.merchants.approve(admin, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOkResponse({ type: MerchantDto })
  reject(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: RejectMerchantDto) {
    return this.merchants.reject(admin, id, dto.reason);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: MerchantDto })
  suspend(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.merchants.suspend(admin, id);
  }
}
