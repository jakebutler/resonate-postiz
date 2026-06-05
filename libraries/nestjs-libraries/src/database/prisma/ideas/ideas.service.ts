import { Injectable, NotFoundException } from '@nestjs/common';
import { IdeaStatus } from '@prisma/client';
import { IdeasRepository } from '@gitroom/nestjs-libraries/database/prisma/ideas/ideas.repository';
import {
  AppendIdeaEntryDto,
  CreateIdeaDto,
  IdeaStatusValue,
  UpdateIdeaStatusDto,
} from '@gitroom/nestjs-libraries/dtos/ideas/idea.dto';

const statusMap: Record<IdeaStatusValue, IdeaStatus> = {
  inbox: IdeaStatus.INBOX,
  reviewing: IdeaStatus.REVIEWING,
  ready: IdeaStatus.READY,
  used: IdeaStatus.USED,
  archived: IdeaStatus.ARCHIVED,
};

const reverseStatusMap: Record<IdeaStatus, IdeaStatusValue> = {
  [IdeaStatus.INBOX]: 'inbox',
  [IdeaStatus.REVIEWING]: 'reviewing',
  [IdeaStatus.READY]: 'ready',
  [IdeaStatus.USED]: 'used',
  [IdeaStatus.ARCHIVED]: 'archived',
};

@Injectable()
export class IdeasService {
  constructor(private _ideasRepository: IdeasRepository) {}

  async list(
    orgId: string,
    filters: { q?: string; status?: string; includeArchived?: boolean }
  ) {
    const status = this.toStatus(filters.status);
    const ideas = await this._ideasRepository.list(orgId, {
      q: filters.q?.trim(),
      status: status || (filters.status === 'all' ? 'ALL' : undefined),
      includeArchived: filters.includeArchived,
    });

    return ideas.map((idea) => this.serializeIdea(idea));
  }

  async get(orgId: string, id: string) {
    const idea = await this._ideasRepository.get(orgId, id);
    if (!idea) {
      throw new NotFoundException('Idea not found');
    }

    return this.serializeIdea(idea);
  }

  async create(orgId: string, body: CreateIdeaDto) {
    const idea = await this._ideasRepository.create(orgId, {
      title: body.title?.trim() || this.titleFromNote(body.note),
      note: body.note.trim(),
      sourceUrl: body.sourceUrl?.trim() || undefined,
      tags: this.cleanTags(body.tags),
      status: this.toStatus(body.status) || IdeaStatus.INBOX,
    });

    return this.serializeIdea(idea);
  }

  async append(orgId: string, id: string, body: AppendIdeaEntryDto) {
    const idea = await this._ideasRepository.append(
      orgId,
      id,
      body.note.trim()
    );
    if (!idea) {
      throw new NotFoundException('Idea not found');
    }

    return this.serializeIdea(idea);
  }

  async updateStatus(orgId: string, id: string, body: UpdateIdeaStatusDto) {
    const idea = await this._ideasRepository.updateStatus(
      orgId,
      id,
      this.toStatus(body.status) || IdeaStatus.INBOX
    );
    if (!idea) {
      throw new NotFoundException('Idea not found');
    }

    return this.serializeIdea(idea);
  }

  private toStatus(status?: string) {
    return statusMap[status as IdeaStatusValue];
  }

  private cleanTags(tags?: string[]) {
    return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))];
  }

  private titleFromNote(note: string) {
    return note.replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  private parseTags(tags: string) {
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed)
        ? parsed.filter((tag) => typeof tag === 'string')
        : [];
    } catch (err) {
      return [];
    }
  }

  private serializeIdea(idea: any) {
    const entries = (idea.entries || []).map((entry: any) => ({
      id: entry.id,
      note: entry.note,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));

    return {
      id: idea.id,
      title: idea.title,
      sourceUrl: idea.sourceUrl,
      tags: this.parseTags(idea.tags),
      status: reverseStatusMap[idea.status as IdeaStatus],
      createdAt: idea.createdAt,
      updatedAt: idea.updatedAt,
      latestEntry: entries[entries.length - 1] || entries[0],
      entries,
    };
  }
}
