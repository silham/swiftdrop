import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth';
import { PaginationQuery } from '../../common/pagination/pagination';
import { ParcelDto } from '../parcels';
import { ApiKeyGuard } from './api-key.guard';
import { MerchantCreateParcelDto } from './dto/merchant-api.dto';
import { MerchantApiService } from './merchant-api.service';

/** Owner: M5 — versioned partner API. @Public() skips JWT; ApiKeyGuard authenticates instead. */
@ApiTags('merchant-api')
@ApiSecurity('merchant-api-key')
@Controller('merchant')
@Public()
@UseGuards(ApiKeyGuard)
export class MerchantApiController {
  constructor(private readonly api: MerchantApiService) {}

  @Post('parcels')
  @ApiOperation({ summary: 'Create a parcel (idempotent on merchantReference)' })
  @ApiOkResponse({ type: ParcelDto })
  async create(
    @Req() req: Request,
    @Body() dto: MerchantCreateParcelDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.api.createParcel(req.merchantId!, dto);
    res.status(result.isExisting ? HttpStatus.OK : HttpStatus.CREATED);
    return result.parcel;
  }

  @Get('parcels')
  @ApiOperation({ summary: 'List parcels for the authenticated merchant' })
  list(@Req() req: Request, @Query() q: PaginationQuery) {
    return this.api.listParcels(req.merchantId!, q);
  }

  @Get('parcels/:trackingNumber')
  @ApiOperation({ summary: 'Get a parcel by tracking number' })
  @ApiOkResponse({ type: ParcelDto })
  get(@Req() req: Request, @Param('trackingNumber') trackingNumber: string) {
    return this.api.getParcel(req.merchantId!, trackingNumber);
  }
}
