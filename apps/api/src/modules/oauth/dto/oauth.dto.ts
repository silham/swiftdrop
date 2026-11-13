import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, type Role } from '@swiftdrop/contracts';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** The authorization request parameters, as the consent page forwards them. */
export class AuthorizeQueryDto {
  @ApiProperty({ example: 'code' }) @IsString() @MaxLength(20) response_type: string;
  @ApiProperty() @IsString() @MaxLength(200) client_id: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) redirect_uri?: string;
  @ApiProperty() @IsString() @MaxLength(200) code_challenge: string;
  @ApiProperty({ example: 'S256' }) @IsString() @MaxLength(10) code_challenge_method: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) scope?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) resource?: string;
}

export class AuthorizeDecisionDto extends AuthorizeQueryDto {
  @ApiProperty({ enum: ['allow', 'deny'] }) @IsIn(['allow', 'deny']) decision: 'allow' | 'deny';
}

export class ConsentToolDto {
  @ApiProperty() name: string;
  @ApiProperty() title: string;
  @ApiProperty() readOnly: boolean;
}

export class ConsentUserDto {
  @ApiProperty() email: string;
  @ApiProperty({ enum: ROLES }) role: Role;
}

export class AuthorizeCheckDto {
  @ApiProperty() clientName: string;
  @ApiProperty({ example: 'claude.ai' }) redirectHost: string;
  @ApiProperty({ type: ConsentUserDto }) user: ConsentUserDto;
  @ApiProperty({ type: [ConsentToolDto] }) tools: ConsentToolDto[];
}

export class AuthorizeRedirectDto {
  @ApiProperty() redirectTo: string;
}
