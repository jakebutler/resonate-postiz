import { Injectable, NotFoundException } from '@nestjs/common';
import { VoicePacksRepository } from '@gitroom/nestjs-libraries/database/prisma/voice-packs/voice-packs.repository';
import {
  SetDefaultVoicePackDto,
  VoicePackDto,
} from '@gitroom/nestjs-libraries/dtos/voice-packs/voice-pack.dto';

@Injectable()
export class VoicePacksService {
  constructor(private _voicePacksRepository: VoicePacksRepository) {}

  list(orgId: string) {
    return this._voicePacksRepository.list(orgId);
  }

  async get(orgId: string, id: string) {
    const voicePack = await this._voicePacksRepository.get(orgId, id);
    if (!voicePack) {
      throw new NotFoundException('Voice pack not found');
    }
    return voicePack;
  }

  create(orgId: string, body: VoicePackDto) {
    return this._voicePacksRepository.create(orgId, {
      ...body,
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
      markdown: body.markdown.trim(),
    });
  }

  async update(orgId: string, id: string, body: VoicePackDto) {
    await this.get(orgId, id);
    return this._voicePacksRepository.update(orgId, id, {
      ...body,
      name: body.name.trim(),
      description: body.description?.trim() || undefined,
      markdown: body.markdown.trim(),
    });
  }

  async setDefault(orgId: string, id: string, body: SetDefaultVoicePackDto) {
    await this.get(orgId, id);
    return this._voicePacksRepository.setDefault(orgId, id, body.isDefault);
  }

  async delete(orgId: string, id: string) {
    await this.get(orgId, id);
    return this._voicePacksRepository.delete(orgId, id);
  }
}
