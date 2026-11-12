/**
 * Root module. ALL feature modules are pre-registered here so nobody needs to edit this file.
 * Owner: M1. If you think you need to change it, ask in your PR / team channel first.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthCoreModule, JwtAuthGuard, RolesGuard } from './common/auth';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggerModule } from './common/logger/logger.module';
import { APP_CONFIG, ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { EventsModule } from './infra/events';
import { PrismaModule } from './infra/prisma';
import { StorageModule } from './infra/storage';
// feature modules (owner)
import { AuditModule } from './modules/audit'; // M9
import { AuthModule } from './modules/auth'; // M2
import { BookingsModule } from './modules/bookings'; // M3
import { CourierModule } from './modules/courier'; // M6
import { DevLoginModule } from './modules/dev-login'; // M1
import { DispatchModule } from './modules/dispatch'; // M7
import { EventOpsModule } from './modules/event-ops'; // M8
import { HealthModule } from './modules/health'; // M10
import { MerchantApiModule } from './modules/merchant-api'; // M5
import { MerchantsModule } from './modules/merchants'; // M5
import { ParcelsModule } from './modules/parcels'; // M4
import { PricingModule } from './modules/pricing'; // M7
import { ReportsModule } from './modules/reports'; // M9
import { UsersModule } from './modules/users'; // M2
import { OAuthModule } from './modules/oauth'; // M1 (MCP authorization server)
import { McpModule } from './modules/mcp'; // M1
import { AssistantModule } from './modules/assistant'; // M1

@Module({
  imports: [
    // foundation
    ConfigModule,
    LoggerModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: Env) => [{ ttl: config.THROTTLE_TTL_MS, limit: config.THROTTLE_LIMIT }],
    }),
    PrismaModule,
    EventsModule,
    StorageModule,
    AuthCoreModule,
    // features
    HealthModule,
    DevLoginModule,
    AuthModule,
    UsersModule,
    AuditModule,
    PricingModule,
    ParcelsModule,
    BookingsModule,
    DispatchModule,
    CourierModule,
    MerchantsModule,
    MerchantApiModule,
    ReportsModule,
    EventOpsModule,
    OAuthModule,
    McpModule,
    AssistantModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
