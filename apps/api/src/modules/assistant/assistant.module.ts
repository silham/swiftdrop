import { Module } from '@nestjs/common';
import { AiToolsModule } from '../ai-tools';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { LlmClient } from './llm-client';

/** Tracking page chatbot over any OpenAI-compatible model. Owner: M1. */
@Module({
  imports: [AiToolsModule],
  controllers: [AssistantController],
  providers: [AssistantService, LlmClient],
})
export class AssistantModule {}
