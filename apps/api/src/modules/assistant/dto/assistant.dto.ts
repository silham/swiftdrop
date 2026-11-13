import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    type: [ChatMessageDto],
    description: 'The conversation so far, oldest first (max 12)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @ApiPropertyOptional({ example: 'SD100000002', description: 'Parcel the user is looking at' })
  @IsOptional()
  @Matches(/^SD\d{9}$/)
  trackingNumber?: string;
}

export class ChatReplyDto {
  @ApiProperty() reply: string;
}

export class AssistantStatusDto {
  @ApiProperty() enabled: boolean;
}
