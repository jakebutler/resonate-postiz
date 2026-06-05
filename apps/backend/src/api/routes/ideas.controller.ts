import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { IdeasService } from '@gitroom/nestjs-libraries/database/prisma/ideas/ideas.service';
import {
  AppendIdeaEntryDto,
  CreateIdeaDraftDto,
  CreateIdeaDto,
  GenerateIdeaDraftDto,
  UpdateIdeaStatusDto,
} from '@gitroom/nestjs-libraries/dtos/ideas/idea.dto';

@ApiTags('Ideas')
@Controller('/ideas')
export class IdeasController {
  constructor(private _ideasService: IdeasService) {}

  @Get('/')
  listIdeas(
    @GetOrgFromRequest() org: Organization,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('includeArchived') includeArchived?: string
  ) {
    return this._ideasService.list(org.id, {
      q,
      status,
      includeArchived: includeArchived === 'true',
    });
  }

  @Get('/:id')
  getIdea(@GetOrgFromRequest() org: Organization, @Param('id') id: string) {
    return this._ideasService.get(org.id, id);
  }

  @Post('/')
  createIdea(
    @GetOrgFromRequest() org: Organization,
    @Body() body: CreateIdeaDto
  ) {
    return this._ideasService.create(org.id, body);
  }

  @Post('/:id/entries')
  appendEntry(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: AppendIdeaEntryDto
  ) {
    return this._ideasService.append(org.id, id, body);
  }

  @Post('/:id/drafts')
  createDraft(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: CreateIdeaDraftDto
  ) {
    return this._ideasService.createDraft(org.id, id, body);
  }

  @Post('/:id/ai-draft')
  generateDraft(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: GenerateIdeaDraftDto
  ) {
    return this._ideasService.generateDraft(org.id, id, body);
  }

  @Post('/:id/ai-draft/create')
  generateAndCreateDraft(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: GenerateIdeaDraftDto
  ) {
    return this._ideasService.generateAndCreateDraft(org.id, id, body);
  }

  @Put('/:id/status')
  updateStatus(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: UpdateIdeaStatusDto
  ) {
    return this._ideasService.updateStatus(org.id, id, body);
  }
}
