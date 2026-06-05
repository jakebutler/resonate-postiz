'use client';

import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import clsx from 'clsx';
import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';

type VoicePack = {
  id: string;
  name: string;
  description?: string;
  markdown: string;
  isDefault: boolean;
  updatedAt: string;
};

const starterMarkdown = `# Corvo Labs Voice Pack

## Style and Tone
- Clear, practical, and specific.
- Prefer concrete tradeoffs over hype.
- Write like a builder explaining the work to another capable builder.

## Use
- operational clarity
- rigorous but readable
- shipped evidence

## Avoid
- vague futurism
- inflated claims
- empty AI jargon

## Strong Points of View
- Strategy should turn into working systems.
- Human review remains part of serious publishing workflows.
- Evidence beats polish when trust matters.

## Platform Notes
- LinkedIn: concise hook, concrete example, clear takeaway.
- Blog: thesis first, structured sections, explicit caveats.
`;

function downloadMarkdown(pack: VoicePack) {
  const blob = new Blob([pack.markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${pack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

export const VoicePacksComponent = () => {
  const fetch = useFetch();
  const [selectedId, setSelectedId] = useState<string>();
  const [name, setName] = useState('Corvo Labs Default');
  const [description, setDescription] = useState(
    'Placeholder Corvo Labs voice pack for MVP drafting.'
  );
  const [markdown, setMarkdown] = useState(starterMarkdown);
  const [isDefault, setIsDefault] = useState(true);
  const load = async (path: string) => (await fetch(path)).json();
  const { data: packs = [], mutate } = useSWR<VoicePack[]>(
    '/voice-packs',
    load
  );
  const selected = packs.find((pack) => pack.id === selectedId);

  useEffect(() => {
    if (!selected) {
      return;
    }
    setName(selected.name);
    setDescription(selected.description || '');
    setMarkdown(selected.markdown);
    setIsDefault(selected.isDefault);
  }, [selected]);

  const resetForm = () => {
    setSelectedId(undefined);
    setName('Corvo Labs Default');
    setDescription('Placeholder Corvo Labs voice pack for MVP drafting.');
    setMarkdown(starterMarkdown);
    setIsDefault(!packs.some((pack) => pack.isDefault));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const body = JSON.stringify({
      name,
      description,
      markdown,
      isDefault,
    });
    const response = await fetch(
      selectedId ? `/voice-packs/${selectedId}` : '/voice-packs',
      {
        method: selectedId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );
    const saved = (await response.json()) as VoicePack;
    setSelectedId(saved.id);
    await mutate();
  };

  const setDefault = async (pack: VoicePack) => {
    await fetch(`/voice-packs/${pack.id}/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    await mutate();
  };

  const remove = async (pack: VoicePack) => {
    await fetch(`/voice-packs/${pack.id}`, { method: 'DELETE' });
    if (selectedId === pack.id) {
      resetForm();
    }
    await mutate();
  };

  return (
    <div className="flex flex-1 bg-newBgColorInner overflow-hidden">
      <div className="w-[340px] shrink-0 border-e border-newBgLineColor overflow-y-auto">
        <div className="p-[18px] border-b border-newBgLineColor">
          <button
            onClick={resetForm}
            className="bg-forth text-white rounded-[8px] px-[14px] py-[10px] font-[700] w-full"
          >
            New Voice Pack
          </button>
        </div>
        <div className="flex flex-col">
          {packs.map((pack) => (
            <button
              key={pack.id}
              onClick={() => setSelectedId(pack.id)}
              className={clsx(
                'text-start px-[18px] py-[16px] border-b border-newBgLineColor hover:bg-newBgColor transition-colors',
                selectedId === pack.id && 'bg-newBgColor'
              )}
            >
              <div className="flex gap-[8px] items-center">
                <div className="font-[700] truncate flex-1">{pack.name}</div>
                {pack.isDefault ? (
                  <span className="text-[11px] uppercase text-forth">
                    Default
                  </span>
                ) : null}
              </div>
              <div className="text-[13px] text-textItemBlur mt-[6px] line-clamp-2">
                {pack.description || 'No description'}
              </div>
            </button>
          ))}
          {!packs.length ? (
            <div className="p-[24px] text-textItemBlur">
              No voice packs yet.
            </div>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={save}
        className="flex-1 overflow-y-auto p-[28px] flex flex-col gap-[14px]"
      >
        <div className="grid grid-cols-[1fr_180px] gap-[12px]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Voice pack name"
            className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none text-[20px] font-[700]"
          />
          <label className="flex items-center gap-[8px] bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px]">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            Brand default
          </label>
        </div>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short description"
          className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[12px] py-[10px] outline-none"
        />
        <textarea
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          className="bg-newBgColor border border-newBgLineColor rounded-[8px] px-[14px] py-[12px] outline-none min-h-[520px] resize-none font-mono text-[13px] leading-[1.6]"
        />
        <div className="flex gap-[10px]">
          <button
            disabled={!name.trim() || !markdown.trim()}
            className="bg-forth text-white rounded-[8px] px-[14px] py-[10px] font-[700] disabled:opacity-50"
          >
            Save Voice Pack
          </button>
          {selected ? (
            <>
              {!selected.isDefault ? (
                <button
                  type="button"
                  onClick={() => setDefault(selected)}
                  className="border border-newBgLineColor rounded-[8px] px-[14px] py-[10px] font-[700]"
                >
                  Make Default
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => downloadMarkdown(selected)}
                className="border border-newBgLineColor rounded-[8px] px-[14px] py-[10px] font-[700]"
              >
                Export
              </button>
              <button
                type="button"
                onClick={() => remove(selected)}
                className="border border-newBgLineColor rounded-[8px] px-[14px] py-[10px] font-[700]"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </form>
    </div>
  );
};
