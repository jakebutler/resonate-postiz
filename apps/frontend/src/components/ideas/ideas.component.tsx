'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import clsx from 'clsx';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import useSWR, { mutate as mutateGlobal } from 'swr';

type IdeaStatus = 'inbox' | 'reviewing' | 'ready' | 'used' | 'archived';

type IdeaEntry = {
  id: string;
  note: string;
  createdAt: string;
};

type Idea = {
  id: string;
  title?: string;
  sourceUrl?: string;
  tags: string[];
  status: IdeaStatus;
  updatedAt: string;
  latestEntry?: IdeaEntry;
  entries: IdeaEntry[];
  posts: Array<{
    id: string;
    state: string;
    content: string;
    createdAt: string;
    releaseURL?: string;
    integration: {
      id: string;
      name: string;
      providerIdentifier: string;
    };
  }>;
};

type Integration = {
  id: string;
  name: string;
  identifier: string;
  disabled: boolean;
};

type VoicePack = {
  id: string;
  name: string;
  isDefault: boolean;
};

type AiDraft = {
  model: string;
  inferenceId?: string;
  questions: string[];
  angle: string;
  structure: string;
  draft: string;
  voicePack?: {
    id: string;
    name: string;
    isDefault: boolean;
  };
};

type SourceMatchesResponse = {
  normalizedSourceUrl?: string;
  matches: Idea[];
};

const statuses: Array<{ value: IdeaStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'ready', label: 'Ready' },
  { value: 'used', label: 'Used' },
  { value: 'archived', label: 'Archived' },
];

function formatDate(value?: string) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function tagsFromInput(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export const IdeasComponent = () => {
  const fetch = useFetch();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<IdeaStatus | 'all'>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [allowCreateDuplicate, setAllowCreateDuplicate] = useState(false);
  const [tags, setTags] = useState('');
  const [appendNote, setAppendNote] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [selectedVoicePackId, setSelectedVoicePackId] = useState('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [aiDraft, setAiDraft] = useState<AiDraft>();
  const [aiError, setAiError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q.trim()) {
      params.set('q', q.trim());
    }
    if (status !== 'all') {
      params.set('status', status);
    }
    if (includeArchived) {
      params.set('includeArchived', 'true');
    }
    return `/ideas?${params.toString()}`;
  }, [q, status, includeArchived]);
  const sourceMatchQuery = useMemo(() => {
    const trimmed = sourceUrl.trim();
    if (!/^https?:\/\//.test(trimmed)) {
      return null;
    }

    return `/ideas/source-matches?sourceUrl=${encodeURIComponent(trimmed)}`;
  }, [sourceUrl]);

  const load = async (path: string) => (await fetch(path)).json();
  const { data: ideas = [], mutate } = useSWR<Idea[]>(query, load);
  const { data: sourceMatchResponse, mutate: mutateSourceMatches } =
    useSWR<SourceMatchesResponse>(sourceMatchQuery, load);
  const { data: integrationsResponse } = useSWR<{
    integrations: Integration[];
  }>('/integrations/list', load);
  const { data: voicePacks = [] } = useSWR<VoicePack[]>('/voice-packs', load);
  const { data: selectedIdea, mutate: mutateSelected } = useSWR<Idea>(
    selectedId ? `/ideas/${selectedId}` : null,
    load
  );
  const integrations = (integrationsResponse?.integrations || []).filter(
    (integration) => !integration.disabled
  );
  const sourceMatches = sourceMatchResponse?.matches || [];

  useEffect(() => {
    setAllowCreateDuplicate(false);
  }, [sourceUrl]);

  const createIdea = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) {
      return;
    }
    if (sourceMatches.length && !allowCreateDuplicate) {
      return;
    }

    setIsSaving(true);
    const response = await fetch('/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim() || undefined,
        note,
        sourceUrl: sourceUrl.trim() || undefined,
        tags: tagsFromInput(tags),
      }),
    });
    const created = (await response.json()) as Idea;
    setSelectedId(created.id);
    setTitle('');
    setNote('');
    setSourceUrl('');
    setAllowCreateDuplicate(false);
    setTags('');
    setIsSaving(false);
    await mutate();
    await mutateSourceMatches();
  };

  const appendCaptureToMatch = async (idea: Idea) => {
    if (!note.trim()) {
      return;
    }

    setIsSaving(true);
    await fetch(`/ideas/${idea.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    setSelectedId(idea.id);
    setTitle('');
    setNote('');
    setSourceUrl('');
    setAllowCreateDuplicate(false);
    setTags('');
    setIsSaving(false);
    await mutate();
    await mutateSourceMatches();
    await mutateGlobal(`/ideas/${idea.id}`);
  };

  const appendEntry = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedIdea || !appendNote.trim()) {
      return;
    }

    await fetch(`/ideas/${selectedIdea.id}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: appendNote }),
    });
    setAppendNote('');
    await mutate();
    await mutateSelected();
  };

  const updateStatus = async (nextStatus: IdeaStatus) => {
    if (!selectedIdea) {
      return;
    }

    await fetch(`/ideas/${selectedIdea.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    await mutate();
    await mutateSelected();
  };

  const createDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedIdea || !selectedIntegrationId) {
      return;
    }

    await fetch(`/ideas/${selectedIdea.id}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId: selectedIntegrationId,
        content: draftContent.trim() || undefined,
      }),
    });
    setDraftContent('');
    await mutate();
    await mutateSelected();
  };

  const generateDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedIdea || !selectedIntegrationId) {
      return;
    }

    setIsGenerating(true);
    setAiError('');
    const response = await fetch(`/ideas/${selectedIdea.id}/ai-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId: selectedIntegrationId,
        voicePackId: selectedVoicePackId || undefined,
        instructions: aiInstructions || undefined,
        fastDraft: false,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setAiError(
        error?.message || error?.error || 'AI draft generation failed'
      );
      setIsGenerating(false);
      return;
    }
    const generated = (await response.json()) as AiDraft;
    setAiDraft(generated);
    setDraftContent(generated.draft || '');
    setIsGenerating(false);
  };

  const generateAndCreateDraft = async () => {
    if (!selectedIdea || !selectedIntegrationId) {
      return;
    }

    setIsGenerating(true);
    setAiError('');
    const response = await fetch(`/ideas/${selectedIdea.id}/ai-draft/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId: selectedIntegrationId,
        voicePackId: selectedVoicePackId || undefined,
        instructions: aiInstructions || undefined,
        fastDraft: true,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setAiError(
        error?.message || error?.error || 'AI draft generation failed'
      );
      setIsGenerating(false);
      return;
    }
    const generated = (await response.json()) as AiDraft;
    setAiDraft(generated);
    setDraftContent('');
    setIsGenerating(false);
    await mutate();
    await mutateSelected();
  };

  const selectedFromList =
    selectedIdea || ideas.find((idea) => idea.id === selectedId);

  return (
    <div className="flex flex-1 bg-newBgColorInner overflow-hidden">
      <div className="w-[360px] shrink-0 border-e border-newBgLineColor overflow-y-auto">
        <form
          onSubmit={createIdea}
          className="p-[20px] border-b border-newBgLineColor flex flex-col gap-[10px]"
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional title"
            className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
          />
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Capture an upstream idea, note, quote, or rough angle"
            className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none min-h-[110px] resize-none"
          />
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://source.example"
            className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
          />
          {sourceMatches.length ? (
            <div className="rounded-[8px] border border-yellow-700/40 bg-yellow-950/20 p-[12px] text-[13px]">
              <div className="font-[700] text-yellow-200">
                Existing Ideas already use this source
              </div>
              <div className="mt-[4px] text-textItemBlur break-all">
                Normalized source: {sourceMatchResponse?.normalizedSourceUrl}
              </div>
              <div className="mt-[10px] flex flex-col gap-[8px]">
                {sourceMatches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-[8px] border border-newBgLineColor bg-newBgColor p-[10px]"
                  >
                    <div className="font-[700]">{match.title}</div>
                    <div className="mt-[4px] line-clamp-2 text-textItemBlur">
                      {match.latestEntry?.note}
                    </div>
                    <button
                      type="button"
                      disabled={isSaving || !note.trim()}
                      onClick={() => appendCaptureToMatch(match)}
                      className="mt-[8px] rounded-[8px] border border-newBgLineColor px-[10px] py-[7px] font-[700] disabled:opacity-50"
                    >
                      Append Note
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setAllowCreateDuplicate(true)}
                className={clsx(
                  'mt-[10px] rounded-[8px] px-[10px] py-[7px] font-[700]',
                  allowCreateDuplicate
                    ? 'bg-forth text-white'
                    : 'border border-newBgLineColor'
                )}
              >
                {allowCreateDuplicate
                  ? 'New Idea Allowed'
                  : 'Create New Idea Anyway'}
              </button>
            </div>
          ) : null}
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="strategy, launch, research"
            className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
          />
          <button
            disabled={
              isSaving ||
              !note.trim() ||
              (!!sourceMatches.length && !allowCreateDuplicate)
            }
            className="bg-forth text-white rounded-[8px] px-[14px] py-[10px] font-[700] disabled:opacity-50"
          >
            Capture Idea
          </button>
        </form>

        <div className="p-[16px] border-b border-newBgLineColor flex flex-col gap-[10px]">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search notes, sources, tags"
            className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
          />
          <div className="grid grid-cols-2 gap-[8px]">
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as IdeaStatus | 'all')
              }
              className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[10px] py-[9px] outline-none"
            >
              {statuses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-[8px] text-[13px] text-textItemBlur">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Archived
            </label>
          </div>
        </div>

        <div className="flex flex-col">
          {ideas.map((idea) => (
            <button
              key={idea.id}
              onClick={() => setSelectedId(idea.id)}
              className={clsx(
                'text-start px-[18px] py-[16px] border-b border-newBgLineColor hover:bg-newBgColor transition-colors',
                selectedId === idea.id && 'bg-newBgColor'
              )}
            >
              <div className="flex items-center gap-[8px]">
                <div className="font-[700] truncate flex-1">
                  {idea.title || 'Untitled idea'}
                </div>
                <span className="text-[11px] uppercase text-textItemBlur">
                  {idea.status}
                </span>
              </div>
              <div className="text-[13px] text-textItemBlur mt-[6px] line-clamp-2">
                {idea.latestEntry?.note}
              </div>
              <div className="flex gap-[6px] mt-[10px] flex-wrap">
                {idea.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-[7px] py-[3px] rounded-[6px] bg-newBgLineColor"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {!ideas.length && (
            <div className="p-[24px] text-textItemBlur">
              No ideas match this view.
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedFromList ? (
          <div className="h-full flex items-center justify-center text-textItemBlur">
            Select an idea to review its thread.
          </div>
        ) : (
          <div className="max-w-[920px] p-[28px] flex flex-col gap-[20px]">
            <div className="flex gap-[16px] items-start">
              <div className="flex-1 min-w-0">
                <div className="text-[28px] font-[700] leading-[1.2]">
                  {selectedFromList.title || 'Untitled idea'}
                </div>
                {selectedFromList.sourceUrl ? (
                  <a
                    href={selectedFromList.sourceUrl}
                    target="_blank"
                    className="text-[13px] text-forth break-all mt-[8px] block"
                  >
                    {selectedFromList.sourceUrl}
                  </a>
                ) : null}
              </div>
              <select
                value={selectedFromList.status}
                onChange={(event) =>
                  updateStatus(event.target.value as IdeaStatus)
                }
                className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
              >
                {statuses
                  .filter((item) => item.value !== 'all')
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-[8px]">
              {selectedFromList.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[12px] px-[8px] py-[4px] rounded-[6px] bg-newBgLineColor"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-[12px]">
              {(selectedFromList.entries || []).map((entry, index) => (
                <div
                  key={entry.id}
                  className={clsx(
                    'border border-newBgLineColor rounded-[8px] p-[16px] bg-newBgColor',
                    index === selectedFromList.entries.length - 1 &&
                      'border-forth'
                  )}
                >
                  <div className="text-[12px] text-textItemBlur mb-[8px]">
                    {formatDate(entry.createdAt)}
                  </div>
                  <div className="whitespace-pre-wrap leading-[1.6]">
                    {entry.note}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={createDraft}
              className="border border-newBgLineColor rounded-[8px] p-[16px] flex flex-col gap-[10px]"
            >
              <div className="font-[700]">Create draft Post</div>
              <div className="grid grid-cols-[240px_1fr] gap-[10px]">
                <select
                  value={selectedIntegrationId}
                  onChange={(event) =>
                    setSelectedIntegrationId(event.target.value)
                  }
                  className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
                >
                  <option value="">Select channel</option>
                  {integrations.map((integration) => (
                    <option key={integration.id} value={integration.id}>
                      {integration.name} ({integration.identifier})
                    </option>
                  ))}
                </select>
                <input
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                  placeholder="Optional override copy; blank uses the Idea thread"
                  className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
                />
              </div>
              <button
                disabled={!selectedIntegrationId}
                className="bg-forth text-white rounded-[8px] px-[14px] py-[10px] font-[700] disabled:opacity-50 w-fit"
              >
                Create Draft
              </button>
            </form>

            <form
              onSubmit={generateDraft}
              className="border border-newBgLineColor rounded-[8px] p-[16px] flex flex-col gap-[10px]"
            >
              <div className="font-[700]">AI brainstorm and draft</div>
              <div className="grid grid-cols-[240px_1fr] gap-[10px]">
                <select
                  value={selectedVoicePackId}
                  onChange={(event) =>
                    setSelectedVoicePackId(event.target.value)
                  }
                  className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
                >
                  <option value="">Default voice pack</option>
                  {voicePacks.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}
                      {pack.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
                <input
                  value={aiInstructions}
                  onChange={(event) => setAiInstructions(event.target.value)}
                  placeholder="Optional drafting instructions"
                  className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
                />
              </div>
              <div className="flex gap-[10px]">
                <button
                  disabled={
                    isGenerating || !selectedIntegrationId || !selectedIdea
                  }
                  className="bg-forth text-white rounded-[8px] px-[14px] py-[10px] font-[700] disabled:opacity-50"
                >
                  Generate Candidate
                </button>
                <button
                  type="button"
                  disabled={
                    isGenerating || !selectedIntegrationId || !selectedIdea
                  }
                  onClick={generateAndCreateDraft}
                  className="border border-newBgLineColor rounded-[8px] px-[14px] py-[10px] font-[700] disabled:opacity-50"
                >
                  Fast Draft
                </button>
              </div>
              {aiError ? (
                <div className="text-red-400 bg-newBgColor rounded-[8px] border border-red-900/40 p-[12px]">
                  {aiError}
                </div>
              ) : null}
              {aiDraft ? (
                <div className="bg-newBgColor rounded-[8px] border border-newBgLineColor p-[14px] flex flex-col gap-[10px]">
                  <div className="text-[12px] text-textItemBlur">
                    {aiDraft.model}
                    {aiDraft.voicePack?.name
                      ? ` · ${aiDraft.voicePack.name}`
                      : ''}
                  </div>
                  {aiDraft.questions.length ? (
                    <div>
                      <div className="font-[700] mb-[6px]">Questions</div>
                      <ul className="list-disc ps-[20px]">
                        {aiDraft.questions.map((question) => (
                          <li key={question}>{question}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {aiDraft.angle ? (
                    <div>
                      <div className="font-[700] mb-[6px]">Angle</div>
                      <div className="whitespace-pre-wrap">{aiDraft.angle}</div>
                    </div>
                  ) : null}
                  {aiDraft.structure ? (
                    <div>
                      <div className="font-[700] mb-[6px]">Structure</div>
                      <div className="whitespace-pre-wrap">
                        {aiDraft.structure}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div className="font-[700] mb-[6px]">Draft</div>
                    <div className="whitespace-pre-wrap leading-[1.6]">
                      {aiDraft.draft}
                    </div>
                  </div>
                </div>
              ) : null}
            </form>

            <div className="flex flex-col gap-[10px]">
              <div className="font-[700]">Linked draft Posts</div>
              {(selectedFromList.posts || []).map((post) => (
                <div
                  key={post.id}
                  className="border border-newBgLineColor rounded-[8px] p-[14px] bg-newBgColor"
                >
                  <div className="flex gap-[10px] items-center">
                    <div className="font-[700] flex-1">
                      {post.integration.name}
                    </div>
                    <span className="text-[11px] uppercase text-textItemBlur">
                      {post.state}
                    </span>
                  </div>
                  <div className="text-[12px] text-textItemBlur mt-[4px]">
                    {formatDate(post.createdAt)}
                  </div>
                  <div className="line-clamp-2 mt-[8px] text-[13px]">
                    {post.content}
                  </div>
                </div>
              ))}
              {!(selectedFromList.posts || []).length ? (
                <div className="text-textItemBlur">
                  No draft Posts have been created from this Idea yet.
                </div>
              ) : null}
            </div>

            <form onSubmit={appendEntry} className="flex flex-col gap-[10px]">
              <textarea
                value={appendNote}
                onChange={(event) => setAppendNote(event.target.value)}
                placeholder="Append a new note without overwriting the thread"
                className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none min-h-[110px] resize-none"
              />
              <div className="flex gap-[10px]">
                <button
                  disabled={!appendNote.trim()}
                  className="bg-forth text-white rounded-[8px] px-[14px] py-[10px] font-[700] disabled:opacity-50"
                >
                  Append Entry
                </button>
                {selectedFromList.status !== 'archived' ? (
                  <button
                    type="button"
                    onClick={() => updateStatus('archived')}
                    className="border border-newBgLineColor rounded-[8px] px-[14px] py-[10px] font-[700]"
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
