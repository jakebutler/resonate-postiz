import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class VoicePackDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @MinLength(1)
  markdown: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class SetDefaultVoicePackDto {
  @IsBoolean()
  isDefault: boolean;
}
