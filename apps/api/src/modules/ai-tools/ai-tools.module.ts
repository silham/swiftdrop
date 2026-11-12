import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings';
import { CourierModule } from '../courier';
import { DispatchModule } from '../dispatch';
import { MerchantsModule } from '../merchants';
import { ParcelsModule } from '../parcels';
import { PricingModule } from '../pricing';
import { ReportsModule } from '../reports';
import { AiToolsService } from './ai-tools.service';

/** Role-aware tools for AI clients (MCP server, tracking page chatbot). Owner: M1. */
@Module({
  imports: [
    ParcelsModule,
    PricingModule,
    BookingsModule,
    MerchantsModule,
    CourierModule,
    DispatchModule,
    ReportsModule,
  ],
  providers: [AiToolsService],
  exports: [AiToolsService],
})
export class AiToolsModule {}
