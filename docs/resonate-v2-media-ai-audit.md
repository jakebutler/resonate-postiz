# Resonate V2 Media and AI Capability Audit

Date: 2026-06-05

Issue: jakebutler/resonate#50

## Scope

This audit covers the Postiz fork's existing text, media, upload, editing, and generation capabilities for the self-hosted Resonate v2 rollout. The goal is to avoid custom media work in v1 unless it is necessary for the MVP demo, while preserving the relationships needed to connect assets back to Ideas, draft Posts, prompts, and scheduled outputs.

## Decisions

| Capability | Existing surface | Required setup | Decision | Notes |
| --- | --- | --- | --- | --- |
| Text AI helpers for post drafting, rewriting, shortening, threading, and voice conversion | `OpenaiService`, post generator routes, launch editor helpers | OpenAI API key for upstream Postiz helpers; Pioneer key for custom Idea drafting | v1 for custom Idea drafting, v1.1 for broader Postiz text helpers | The custom Idea-to-draft path now uses Pioneer. Existing generic Postiz helpers still depend on OpenAI and should not block MVP. |
| Idea and raw-note AI brainstorming | `/ideas/:id/ai-draft`, `/ideas/ai-draft-sessions` | Pioneer key, connected/seeded target integration, optional voice pack | v1 | Validated with `claude-opus-4-7`; sessions persist and restore. |
| Local media upload and media library | `/media/upload-simple`, `/media/upload-server`, `/media`, local storage provider | `STORAGE_PROVIDER=local`, `UPLOAD_DIRECTORY`, frontend upload route serving local files | v1 | Low setup and validated. Works for supported media types. |
| Media metadata editing | `/media/information` | Existing saved media | v1 | Supports alt text, thumbnail, and thumbnail timestamp updates. Useful for accessibility and video thumbnails. |
| Attach existing media to Posts | Launch editor media picker, provider-specific `media` arrays, `PostsService` media lookup | Saved media in library | v1 | Post records reference media by id through provider payloads. This is enough for MVP scheduling handoff. |
| Design media / Polotno editor | Frontend design media surface, `/media/upload-simple` save path | Frontend editor dependencies; local upload storage | v1.1 | Useful but not required for Corvo Labs blog + one social channel MVP. Validate visually before including in v1. |
| AI image generation | `/media/generate-image`, `/media/generate-image-with-prompt` | OpenAI API key, image model access, credits/subscription checks | v1.1 | Medium setup because it uses OpenAI, credit checks, and image model behavior outside the Pioneer drafting path. |
| AI video generation | `/media/generate-video`, `/media/video-options`, `/media/video/function` | Third-party video provider configuration, credits/subscription checks | v1.1 or later | Not necessary for first success state. Keep provider hooks but do not block MVP on it. |
| HeyGen avatar video provider | `HeygenProvider` third-party media provider | HeyGen API key, avatar/voice selection, polling | later | Valuable for video-heavy brands, but too much setup for v1. |
| ReelFarm media library provider | `ReelFarm` third-party provider | External provider account/API | later | Treat as optional external media source, not core workflow. |
| Agent Media SSO | `/user/agent-media-sso` | `AGENT_MEDIA_SSO_KEY` and external Agent Media account | later | Not needed until the media strategy depends on external AI media creation. |
| Cloudflare/R2 upload storage | `STORAGE_PROVIDER=cloudflare` | Cloudflare account, bucket, access keys, public URL | v1.1 for production hardening | Local storage is enough for early self-hosted validation. Cloudflare/R2 is better for durable production media hosting. |

## Provider and Key Requirements

- Pioneer:
  - Required for custom Idea and raw-note AI drafting.
  - Env: `PIONEER_API_KEY`, `PIONEER_DRAFT_MODEL`, optional `PIONEER_DRAFT_MAX_TOKENS`.
- OpenAI:
  - Required for existing Postiz generic text helpers and image generation.
  - Env: `OPENAI_API_KEY`.
  - Not required for the v1 Idea-to-draft MVP path.
- Local storage:
  - Required for low-effort self-hosted upload validation.
  - Env: `STORAGE_PROVIDER=local`, `UPLOAD_DIRECTORY`, `NEXT_PUBLIC_UPLOAD_DIRECTORY`.
- Cloudflare/R2:
  - Optional production storage hardening.
  - Env: Cloudflare account, bucket, access key, secret, region, and bucket URL variables.
- HeyGen/ReelFarm/Agent Media:
  - Optional third-party media providers.
  - Defer until a v1.1 or later video workflow requires them.

## Validated Path

Manual validation was run against the local Postiz fork backend on 2026-06-05 using `STORAGE_PROVIDER=local`, `UPLOAD_DIRECTORY=/tmp/postiz-uploads`, and the isolated validation database `postiz_validation_ideas`.

Positive upload result:

- Endpoint: `POST /media/upload-simple`
- Fixture: 1x1 PNG
- Result:
  - `uploaded_id=c69e79fa-b4f1-43b6-95f2-1c07f2d8db2d`
  - `uploaded_original_name=resonate-v2-media-1780688387434.png`
  - `uploaded_path=http://localhost:4200/uploads/2026/06/05/170394559101011c710ade3ca8f8b0eddf3.png`
  - `listed_in_media_library=true`

Negative validation also confirmed that unsupported `.txt` uploads are rejected by `CustomFileValidationPipe`.

## Data Model Notes

Existing media relationships are sufficient for v1 post scheduling:

- `Media` rows belong to an organization.
- Post payloads can reference media by id through provider-specific media arrays.
- `PostsService` resolves media ids when validating and creating posts.

Missing relationship for richer Idea provenance:

- There is no direct first-class link from `Ideas` or `IdeaDraftSessions` to generated/uploaded `Media` rows.
- v1 can rely on Post payload media references plus source URLs and session metadata.
- v1.1 should add a provenance join model, for example `IdeaMediaAsset`, with:
  - `organizationId`
  - optional `ideaId`
  - optional `ideaDraftSessionId`
  - optional `postId`
  - `mediaId`
  - `prompt`
  - `sourceKind` such as `upload`, `generated-image`, `generated-video`, `external-import`
  - `provider`
  - timestamps and soft delete

## V1 Recommendation

Include:

- Pioneer-backed Idea and raw-note drafting.
- Local media upload and media library.
- Media attachment to draft/scheduled posts through existing Postiz post payloads.
- Media metadata editing for alt text and thumbnails.

Defer:

- AI image generation until OpenAI image setup is intentionally configured.
- AI video generation and third-party video providers.
- Cloudflare/R2 storage until production media durability is required.
- Custom Idea-media provenance model until after the first MVP demo, unless media provenance becomes central to the Corvo Labs blog PR flow.
