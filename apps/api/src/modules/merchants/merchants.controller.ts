import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth';
import {
  ApiKeyDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  CreateWebhookDto,
  ListMerchantsQuery,
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
  @ApiOkResponse({ type: WebhookWithSecretDto })
  rotate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merchants.rotateWebhookSecret(user, id);
  }

  @Get('me/webhooks/:id/attempts')
  attempts(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.merchants.listWebhookAttempts(user, id);
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
