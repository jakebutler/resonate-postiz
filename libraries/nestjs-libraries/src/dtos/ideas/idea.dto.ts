import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export const ideaStatuses = [
  'inbox',
  'reviewing',
  'ready',
  'used',
  'archived',
] as const;

export type IdeaStatusValue = (typeof ideaStatuses)[number];

export class CreateIdeaDto {
  @IsString()
  @MinLength(1)
  note: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  @Matches(/^(|https?:\/\/[^\s]+)$/)
  sourceUrl?: string;

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsIn(ideaStatuses)
  @IsOptional()
  status?: IdeaStatusValue;
}

export class AppendIdeaEntryDto {
  @IsString()
  @MinLength(1)
  note: string;
}

export class UpdateIdeaStatusDto {
  @IsIn(ideaStatuses)
  status: IdeaStatusValue;
}

export class CreateIdeaDraftDto {
  @IsString()
  @MinLength(1)
  integrationId: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class GenerateIdeaDraftDto {
  @IsString()
  @MinLength(1)
  integrationId: string;

  @IsString()
  @IsOptional()
  voicePackId?: string;

  @IsString()
  @IsOptional()
  instructions?: string;

  @IsBoolean()
  @IsOptional()
  fastDraft?: boolean;
}
