import { Injectable } from '@nestjs/common';
import { IdeaStatus } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

type ListIdeasFilters = {
  q?: string;
  status?: IdeaStatus | 'ALL';
  includeArchived?: boolean;
};

type CreateIdeaInput = {
  title?: string;
  note: string;
  sourceUrl?: string;
  tags: string[];
  status: IdeaStatus;
};

@Injectable()
export class IdeasRepository {
  constructor(
    private _ideas: PrismaRepository<'ideas' | 'ideaEntries' | 'post'>
  ) {}

  list(orgId: string, filters: ListIdeasFilters) {
    return this._ideas.model.ideas.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(filters.status && filters.status !== 'ALL'
          ? { status: filters.status }
          : filters.includeArchived
          ? {}
          : { status: { not: IdeaStatus.ARCHIVED } }),
        ...(filters.q
          ? {
              OR: [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { sourceUrl: { contains: filters.q, mode: 'insensitive' } },
                { tags: { contains: filters.q, mode: 'insensitive' } },
                {
                  entries: {
                    some: {
                      note: { contains: filters.q, mode: 'insensitive' },
                      deletedAt: null,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        entries: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  get(orgId: string, id: string) {
    return this._ideas.model.ideas.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        entries: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
        posts: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            state: true,
            content: true,
            releaseURL: true,
            createdAt: true,
            updatedAt: true,
            integration: {
              select: {
                id: true,
                name: true,
                providerIdentifier: true,
              },
            },
          },
        },
      },
    });
  }

  create(orgId: string, input: CreateIdeaInput) {
    return this._ideas.model.ideas.create({
      data: {
        organizationId: orgId,
        title: input.title,
        sourceUrl: input.sourceUrl,
        tags: JSON.stringify(input.tags),
        status: input.status,
        entries: {
          create: {
            note: input.note,
          },
        },
      },
      include: {
        entries: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
        posts: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            state: true,
            content: true,
            releaseURL: true,
            createdAt: true,
            updatedAt: true,
            integration: {
              select: {
                id: true,
                name: true,
                providerIdentifier: true,
              },
            },
          },
        },
      },
    });
  }

  async append(orgId: string, id: string, note: string) {
    const idea = await this.get(orgId, id);
    if (!idea) {
      return undefined;
    }

    await this._ideas.model.ideaEntries.create({
      data: { ideaId: id, note },
    });

    await this._ideas.model.ideas.update({
      where: { id, organizationId: orgId },
      data: { updatedAt: new Date() },
    });

    return this.get(orgId, id);
  }

  async updateStatus(orgId: string, id: string, status: IdeaStatus) {
    const idea = await this._ideas.model.ideas.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });
    if (!idea) {
      return undefined;
    }

    return this._ideas.model.ideas.update({
      where: { id, organizationId: orgId },
      data: { status },
      include: {
        entries: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
        posts: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            state: true,
            content: true,
            releaseURL: true,
            createdAt: true,
            updatedAt: true,
            integration: {
              select: {
                id: true,
                name: true,
                providerIdentifier: true,
              },
            },
          },
        },
      },
    });
  }

  linkPost(orgId: string, ideaId: string, postId: string) {
    return this._ideas.model.post.update({
      where: { id: postId, organizationId: orgId },
      data: { ideaId },
      select: { id: true },
    });
  }
}
