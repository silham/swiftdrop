import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { DispatchService } from './dispatch.service';
import {
  ActiveAssignmentPageDto,
  AssignmentDto,
  CourierWorkloadDto,
  CreateAssignmentDto,
  ListAssignmentsQuery,
  ListUnassignedQuery,
  UnassignedParcelPageDto,
} from './dto/dispatch.dto';

/** Owner: M7 */
@ApiTags('dispatch')
@Controller('dispatch')
@Roles('DISPATCHER', 'ADMIN')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('unassigned')
  @ApiOperation({ summary: 'List parcels awaiting courier assignment' })
  @ApiOkResponse({ type: UnassignedParcelPageDto })
  unassigned(@Query() q: ListUnassignedQuery) {
    return this.dispatch.listUnassigned(q);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'List active courier assignments (newest first)' })
  @ApiOkResponse({ type: ActiveAssignmentPageDto })
  assignments(@Query() q: ListAssignmentsQuery) {
    return this.dispatch.listActiveAssignments(q);
  }

  @Post('assignments')
  @ApiOperation({ summary: 'Assign a parcel to a courier' })
  @ApiCreatedResponse({ type: AssignmentDto })
  assign(@CurrentUser() user: AuthUser, @Body() dto: CreateAssignmentDto) {
    return this.dispatch.assign(user, dto);
  }

  @Delete('assignments/:id')
  @ApiOperation({ summary: 'Cancel an active courier assignment' })
  unassign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.unassign(user, id);
  }

  @Get('couriers/workload')
  @ApiOperation({ summary: 'Get current workload and capacity for all couriers' })
  @ApiOkResponse({ type: [CourierWorkloadDto] })
  workload() {
    return this.dispatch.courierWorkload();
  }
}
