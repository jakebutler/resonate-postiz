import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { VoicePackDto } from '@gitroom/nestjs-libraries/dtos/voice-packs/voice-pack.dto';

@Injectable()
export class VoicePacksRepository {
  constructor(private _voicePacks: PrismaRepository<'voicePacks'>) {}

  list(orgId: string) {
    return this._voicePacks.model.voicePacks.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  get(orgId: string, id: string) {
    return this._voicePacks.model.voicePacks.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
  }

  async create(orgId: string, body: VoicePackDto) {
    const created = await this._voicePacks.model.voicePacks.create({
      data: {
        organizationId: orgId,
        name: body.name,
        description: body.description,
        markdown: body.markdown,
        isDefault: !!body.isDefault,
      },
    });

    if (created.isDefault) {
      await this.clearOtherDefaults(orgId, created.id);
    }

    return created;
  }

  async update(orgId: string, id: string, body: VoicePackDto) {
    const updated = await this._voicePacks.model.voicePacks.update({
      where: { id, organizationId: orgId },
      data: {
        name: body.name,
        description: body.description,
        markdown: body.markdown,
        isDefault: !!body.isDefault,
      },
    });

    if (updated.isDefault) {
      await this.clearOtherDefaults(orgId, updated.id);
    }

    return updated;
  }

  async setDefault(orgId: string, id: string, isDefault: boolean) {
    const updated = await this._voicePacks.model.voicePacks.update({
      where: { id, organizationId: orgId },
      data: { isDefault },
    });

    if (isDefault) {
      await this.clearOtherDefaults(orgId, id);
    }

    return updated;
  }

  delete(orgId: string, id: string) {
    return this._voicePacks.model.voicePacks.update({
      where: { id, organizationId: orgId },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  private clearOtherDefaults(orgId: string, id: string) {
    return this._voicePacks.model.voicePacks.updateMany({
      where: { organizationId: orgId, id: { not: id }, deletedAt: null },
      data: { isDefault: false },
    });
  }
}
