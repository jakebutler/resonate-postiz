import { Injectable, NotFoundException } from '@nestjs/common';
import { IdeaStatus } from '@prisma/client';
import { IdeasRepository } from '@gitroom/nestjs-libraries/database/prisma/ideas/ideas.repository';
import {
  AppendIdeaEntryDto,
  CreateIdeaDraftDto,
  CreateIdeaDto,
  GenerateIdeaDraftDto,
  GenerateRawIdeaDraftDto,
  IdeaStatusValue,
  UpdateIdeaStatusDto,
} from '@gitroom/nestjs-libraries/dtos/ideas/idea.dto';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { BadRequestException } from '@nestjs/common';
import dayjs from 'dayjs';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  findIdeaSourceMatches,
  normalizeIdeaSourceUrl,
} from '@gitroom/nestjs-libraries/database/prisma/ideas/ideas.source-url';

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
    private _postsService: PostsService,
    private _openaiService: OpenaiService
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

  async sourceMatches(orgId: string, sourceUrl?: string) {
    const normalizedSourceUrl = normalizeIdeaSourceUrl(sourceUrl);
    if (!normalizedSourceUrl) {
      return {
        normalizedSourceUrl,
        matches: [],
      };
    }

    const candidates = await this._ideasRepository.sourceCandidates(orgId);
    const matches = findIdeaSourceMatches(candidates, sourceUrl).matches.map(
      (idea) => this.serializeIdea(idea)
    );

    return {
      normalizedSourceUrl,
      matches,
    };
  }

  async listDraftSessions(orgId: string, ideaId?: string) {
    return (await this._ideasRepository.listDraftSessions(orgId, ideaId)).map(
      (session) => this.serializeDraftSession(session)
    );
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

  async generateDraft(orgId: string, id: string, body: GenerateIdeaDraftDto) {
    const idea = await this._ideasRepository.get(orgId, id);
    if (!idea) {
      throw new NotFoundException('Idea not found');
    }

    return this.generateDraftCandidate(orgId, {
      idea,
      integrationId: body.integrationId,
      voicePackId: body.voicePackId,
      instructions: body.instructions,
      fastDraft: body.fastDraft,
    });
  }

  async generateRawDraft(orgId: string, body: GenerateRawIdeaDraftDto) {
    return this.generateDraftCandidate(orgId, {
      rawNotes: body.rawNotes,
      sourceUrl: body.sourceUrl,
      tags: body.tags,
      integrationId: body.integrationId,
      voicePackId: body.voicePackId,
      instructions: body.instructions,
      fastDraft: body.fastDraft,
    });
  }

  private async generateDraftCandidate(
    orgId: string,
    input: {
      idea?: any;
      rawNotes?: string;
      sourceUrl?: string;
      tags?: string[];
      integrationId: string;
      voicePackId?: string;
      instructions?: string;
      fastDraft?: boolean;
    }
  ) {
    const integration = (
      await this._integrationService.getIntegrationsList(orgId)
    ).find((item) => item.id === input.integrationId && !item.disabled);
    if (!integration) {
      throw new BadRequestException('Integration not found');
    }

    const voicePack = await this._ideasRepository.getVoicePack(
      orgId,
      input.voicePackId
    );
    const sourceContext = input.idea
      ? this.buildDraftContent(input.idea)
      : this.buildRawDraftContent(input.rawNotes!, input.sourceUrl, input.tags);
    const system = [
      'You are an editorial brainstorming assistant inside Postiz.',
      'You help turn upstream Ideas into draft Posts, but you never publish, schedule, or claim approval.',
      'Ask clarifying questions before drafting unless fastDraft is true.',
      'Return strict JSON with keys: questions, angle, structure, draft.',
      'questions must be an array of strings. angle, structure, and draft must be strings.',
    ].join('\n');
    const user = [
      `Target channel: ${integration.name} (${integration.providerIdentifier})`,
      input.fastDraft
        ? 'Fast draft requested: yes'
        : 'Fast draft requested: no',
      voicePack?.markdown
        ? `Voice pack markdown:\n${voicePack.markdown}`
        : 'Voice pack markdown: none configured.',
      input.instructions?.trim()
        ? `User instructions:\n${input.instructions.trim()}`
        : '',
      input.idea
        ? `Idea context:\n${sourceContext}`
        : `Raw-note context:\n${sourceContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await this._openaiService.pioneerChat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      store: false,
    });
    const parsed = this.parseAiDraft(result.content);
    const session = await this._ideasRepository.createDraftSession(orgId, {
      ideaId: input.idea?.id,
      integrationId: integration.id,
      voicePackId: voicePack?.id,
      sourceKind: input.idea ? 'idea' : 'raw',
      rawNotes: input.idea ? undefined : input.rawNotes?.trim(),
      sourceUrl: input.idea?.sourceUrl || input.sourceUrl?.trim() || undefined,
      tags: input.idea
        ? this.parseTags(input.idea.tags)
        : this.cleanTags(input.tags),
      instructions: input.instructions?.trim() || undefined,
      model: result.model,
      inferenceId: result.inferenceId,
      questions: parsed.questions,
      angle: parsed.angle,
      structure: parsed.structure,
      draft: parsed.draft,
    });

    return {
      sessionId: session.id,
      model: result.model,
      inferenceId: result.inferenceId,
      voicePack: voicePack
        ? {
            id: voicePack.id,
            name: voicePack.name,
            isDefault: voicePack.isDefault,
          }
        : undefined,
      providerIdentifier: integration.providerIdentifier,
      session: this.serializeDraftSession(session),
      ...parsed,
    };
  }

  async generateAndCreateDraft(
    orgId: string,
    id: string,
    body: GenerateIdeaDraftDto
  ) {
    const generated = await this.generateDraft(orgId, id, {
      ...body,
      fastDraft: body.fastDraft ?? true,
    });
    const created = await this.createDraft(orgId, id, {
      integrationId: body.integrationId,
      content: generated.draft,
    });

    return {
      ...generated,
      created,
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

  private buildRawDraftContent(
    rawNotes: string,
    sourceUrl?: string,
    tags?: string[]
  ) {
    const cleanedTags = this.cleanTags(tags);
    return [
      sourceUrl?.trim() ? `Source: ${sourceUrl.trim()}` : '',
      cleanedTags.length ? `Tags: ${cleanedTags.join(', ')}` : '',
      'Raw notes:',
      rawNotes.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private serializeDraftSession(session: any) {
    return {
      id: session.id,
      sourceKind: session.sourceKind,
      rawNotes: session.rawNotes,
      sourceUrl: session.sourceUrl,
      tags: this.parseTags(session.tags),
      instructions: session.instructions,
      model: session.model,
      inferenceId: session.inferenceId,
      questions: this.parseTags(session.questions),
      angle: session.angle,
      structure: session.structure,
      draft: session.draft,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      idea: session.idea,
      integration: session.integration,
      voicePack: session.voicePack,
    };
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

  private parseAiDraft(content: string) {
    const fallback = {
      questions: [] as string[],
      angle: '',
      structure: '',
      draft: content.trim(),
    };

    try {
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      const parsed = JSON.parse(content.slice(start, end + 1));
      return {
        questions: Array.isArray(parsed.questions)
          ? parsed.questions.filter((item: unknown) => typeof item === 'string')
          : [],
        angle: typeof parsed.angle === 'string' ? parsed.angle : '',
        structure: typeof parsed.structure === 'string' ? parsed.structure : '',
        draft: typeof parsed.draft === 'string' ? parsed.draft : fallback.draft,
      };
    } catch (err) {
      return fallback;
    }
  }
}
