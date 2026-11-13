import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch';
import { ParcelsModule } from '../parcels';
import { CourierController, ProofViewController } from './courier.controller';
import { CourierService } from './courier.service';

@Module({
  imports: [ParcelsModule, DispatchModule],
  controllers: [CourierController, ProofViewController],
  providers: [CourierService],
  exports: [CourierService],
})
export class CourierModule {}
