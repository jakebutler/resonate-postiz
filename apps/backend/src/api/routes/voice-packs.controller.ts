import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { VoicePacksService } from '@gitroom/nestjs-libraries/database/prisma/voice-packs/voice-packs.service';
import {
  SetDefaultVoicePackDto,
  VoicePackDto,
} from '@gitroom/nestjs-libraries/dtos/voice-packs/voice-pack.dto';

@ApiTags('Voice Packs')
@Controller('/voice-packs')
export class VoicePacksController {
  constructor(private _voicePacksService: VoicePacksService) {}

  @Get('/')
  list(@GetOrgFromRequest() org: Organization) {
    return this._voicePacksService.list(org.id);
  }

  @Get('/:id')
  get(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._voicePacksService.get(org.id, id);
  }

  @Post('/')
  create(@GetOrgFromRequest() org: Organization, @Body() body: VoicePackDto) {
    return this._voicePacksService.create(org.id, body);
  }

  @Put('/:id')
  update(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: VoicePackDto
  ) {
    return this._voicePacksService.update(org.id, id, body);
  }

  @Put('/:id/default')
  setDefault(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: SetDefaultVoicePackDto
  ) {
    return this._voicePacksService.setDefault(org.id, id, body);
  }

  @Delete('/:id')
  delete(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._voicePacksService.delete(org.id, id);
  }
}
