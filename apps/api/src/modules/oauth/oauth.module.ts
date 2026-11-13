import { Module } from '@nestjs/common';
import { AiToolsModule } from '../ai-tools';
import { OAuthController, WellKnownController } from './oauth.controller';
import { OAuthService } from './oauth.service';

/** OAuth 2.1 authorization server for MCP clients. Owner: M1. */
@Module({
  imports: [AiToolsModule],
  controllers: [OAuthController, WellKnownController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
