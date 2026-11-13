import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { CourierService } from './courier.service';
import {
  CourierHistoryPageDto,
  CourierParcelDetailDto,
  CourierParcelDto,
  CourierStatusUpdateDto,
  ListCourierHistoryQuery,
  ProofOfDeliveryDto,
} from './dto/courier.dto';
import { MULTER_HARD_LIMIT_BYTES } from './file-type';

/** Owner: M6 */
@ApiTags('courier')
@Controller('courier')
@Roles('COURIER')
export class CourierController {
  constructor(private readonly courier: CourierService) {}

  @Get('parcels')
  @ApiOperation({ summary: 'My active assigned deliveries' })
  @ApiOkResponse({ type: [CourierParcelDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.courier.listAssigned(user);
  }

  @Get('parcels/:id')
  @ApiOperation({ summary: 'One of my assigned deliveries, with its status history' })
  @ApiOkResponse({ type: CourierParcelDetailDto })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.courier.getAssigned(user, id);
  }

  @Patch('parcels/:id/status')
  @ApiOperation({ summary: 'Update the status of one of my deliveries (not DELIVERED)' })
  @ApiOkResponse({ type: CourierParcelDetailDto })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CourierStatusUpdateDto,
  ) {
    return this.courier.updateStatus(user, id, dto);
  }

  @Post('parcels/:id/proof')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['recipientName', 'photo'],
      properties: {
        recipientName: { type: 'string', minLength: 2, maxLength: 100 },
        notes: { type: 'string', maxLength: 500 },
        photo: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP' },
      },
    },
  })
  @ApiOperation({ summary: 'Submit proof of delivery (marks DELIVERED)' })
  @ApiOkResponse({ type: CourierParcelDetailDto })
  // The real size limit (UPLOAD_MAX_BYTES → FILE_TOO_LARGE) is checked in the service.
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MULTER_HARD_LIMIT_BYTES } }))
  proof(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ProofOfDeliveryDto,
    @UploadedFile() photo?: Express.Multer.File,
  ) {
    return this.courier.submitProof(user, id, dto, photo);
  }

  @Get('history')
  @ApiOperation({ summary: 'My finished deliveries (delivered, or failed on the last attempt)' })
  @ApiOkResponse({ type: CourierHistoryPageDto })
  history(@CurrentUser() user: AuthUser, @Query() q: ListCourierHistoryQuery) {
    return this.courier.history(user, q);
  }
}

/** Owner: M6 — proof photo viewing for any authorized role (object-level check in service). */
@ApiTags('courier')
@Controller('parcels/:id/proof')
@Roles('COURIER', 'DISPATCHER', 'ADMIN', 'CUSTOMER')
export class ProofViewController {
  constructor(private readonly courier: CourierService) {}

  @Get('photo')
  @ApiOperation({ summary: 'Proof-of-delivery photo (404 unless you may see it)' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @Header('Cache-Control', 'private, no-store')
  async photo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const { stream, contentType } = await this.courier.proofPhoto(user, id);
    return new StreamableFile(stream, { type: contentType });
  }
}
