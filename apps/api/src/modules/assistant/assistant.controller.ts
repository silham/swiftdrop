import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Public } from '../../common/auth';
import { AppError } from '../../common/errors/app-error';
import { AssistantService } from './assistant.service';
import { AssistantStatusDto, ChatReplyDto, ChatRequestDto } from './dto/assistant.dto';

/** Public chatbot on the tracking page. Owner: M1. */
@ApiTags('assistant')
@Controller('assistant')
@Public()
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Whether the assistant is configured' })
  @ApiOkResponse({ type: AssistantStatusDto })
  status(): AssistantStatusDto {
    return { enabled: this.assistant.enabled };
  }

  /** Each message costs a model call, so this is limited much more tightly than the default. */
  @Post('chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ask the delivery assistant (tracking, prices, service areas)' })
  @ApiOkResponse({ type: ChatReplyDto })
  async chat(@Body() dto: ChatRequestDto): Promise<ChatReplyDto> {
    if (dto.messages[dto.messages.length - 1].role !== 'user') {
      throw new AppError(
        'VALIDATION_FAILED',
        'The last message must come from the user',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { reply: await this.assistant.reply(dto.messages, dto.trackingNumber) };
  }
}
