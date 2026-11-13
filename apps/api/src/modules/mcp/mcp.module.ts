import { Module } from '@nestjs/common';
import { AiToolsModule } from '../ai-tools';
import { OAuthModule } from '../oauth';
import { McpController } from './mcp.controller';

/** MCP server (Streamable HTTP) for AI clients. Owner: M1. */
@Module({ imports: [OAuthModule, AiToolsModule], controllers: [McpController] })
export class McpModule {}
