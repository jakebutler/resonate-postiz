import { Injectable, NotFoundException } from '@nestjs/common';
import { IdeaStatus } from '@prisma/client';
import { IdeasRepository } from '@gitroom/nestjs-libraries/database/prisma/ideas/ideas.repository';
import {
  AppendIdeaEntryDto,
  CreateIdeaDraftDto,
  CreateIdeaDto,
  IdeaStatusValue,
  UpdateIdeaStatusDto,
} from '@gitroom/nestjs-libraries/dtos/ideas/idea.dto';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { BadRequestException } from '@nestjs/common';
import dayjs from 'dayjs';

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
  constructor(
    private _ideasRepository: IdeasRepository,
    private _integrationService: IntegrationService,
    private _postsService: PostsService
  ) {}

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

  async createDraft(orgId: string, id: string, body: CreateIdeaDraftDto) {
    const idea = await this._ideasRepository.get(orgId, id);
    if (!idea) {
      throw new NotFoundException('Idea not found');
    }

    const integration = (
      await this._integrationService.getIntegrationsList(orgId)
    ).find((item) => item.id === body.integrationId && !item.disabled);
    if (!integration) {
      throw new BadRequestException('Integration not found');
    }

    const content = body.content?.trim() || this.buildDraftContent(idea);
    const tags = this.parseTags(idea.tags);
    const [created] = await this._postsService.createPost(
      orgId,
      {
        type: 'draft',
        shortLink: false,
        date: dayjs().add(1, 'day').format('YYYY-MM-DDTHH:mm:00'),
        tags: [],
        posts: [
          {
            integration: { id: integration.id },
            value: [
              {
                id: '',
                content,
                delay: 0,
                image: [],
              },
            ],
            settings: this.defaultSettingsForIntegration(
              integration.providerIdentifier,
              idea.title,
              tags
            ) as any,
            group: '',
          },
        ],
      },
      'WEB'
    );

    if (!created?.postId) {
      throw new BadRequestException('Draft could not be created');
    }

    await this._ideasRepository.linkPost(orgId, id, created.postId);
    return {
      postId: created.postId,
      integrationId: integration.id,
      providerIdentifier: integration.providerIdentifier,
      idea: await this.get(orgId, id),
    };
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
      posts: (idea.posts || []).map((post: any) => ({
        id: post.id,
        state: post.state,
        content: post.content,
        releaseURL: post.releaseURL,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        integration: post.integration,
      })),
    };
  }

  private buildDraftContent(idea: any) {
    const tags = this.parseTags(idea.tags);
    const entries = (idea.entries || [])
      .map((entry: any, index: number) => `${index + 1}. ${entry.note}`)
      .join('\n\n');

    return [
      idea.title ? `Working title: ${idea.title}` : '',
      idea.sourceUrl ? `Source: ${idea.sourceUrl}` : '',
      tags.length ? `Tags: ${tags.join(', ')}` : '',
      'Idea notes:',
      entries,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private defaultSettingsForIntegration(
    providerIdentifier: string,
    title: string | undefined,
    tags: string[]
  ) {
    const workingTitle = title || 'Idea draft';
    return {
      __type: providerIdentifier,
      title: workingTitle,
      tags,
      status: 'draft',
    };
  }
}
