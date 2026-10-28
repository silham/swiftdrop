import { Module } from '@nestjs/common';
import { EventOpsController } from './event-ops.controller';
import { EventOpsService } from './event-ops.service';

@Module({ controllers: [EventOpsController], providers: [EventOpsService] })
export class EventOpsModule {}
