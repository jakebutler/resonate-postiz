import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { CorvoLabsBlogDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/corvo-labs-blog.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

const DEFAULT_REPO = 'jakebutler/corvo-labs-dot-com';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_CONTENT_DIR = 'corvo-labs-enhanced/content/blog';
const DEFAULT_AUTHOR = 'Jake Butler';
const DEFAULT_CATEGORY = 'strategy';

type CorvoLabsBlogConnection = {
  apiKey: string;
  repo?: string;
  baseBranch?: string;
  contentDir?: string;
};

type CorvoLabsBlogSettings = CorvoLabsBlogDto & {
  tags?: string | string[];
};

type GitHubHeaders = {
  Authorization: string;
  'Content-Type': string;
  Accept: string;
  'X-GitHub-Api-Version': string;
};

type BlogPostPrParams = {
  token: string;
  repo: string;
  baseBranch: string;
  contentDir: string;
  title: string;
  content: string;
  date?: string;
  status?: string;
  subtitle?: string;
  excerpt?: string;
  author?: string;
  tags?: string[];
  category?: string;
  featured?: boolean;
  heroImageUrl?: string;
  heroImageAlt?: string;
};

type BlogPostPrResult = {
  prUrl: string;
  branchName: string;
  filePath: string;
};

function encodeGitHubContentPath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/');
  if (!owner || !name || repo.split('/').length !== 2) {
    throw new Error('Repository must be in owner/name format.');
  }

  return { owner, name };
}

export function slugifyCorvoBlogTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return slug || makeId(8).toLowerCase();
}

function escapeYamlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*\d.\s]+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function estimateReadTime(markdown: string): string {
  const plainText = stripMarkdown(markdown);
  const words = plainText ? plainText.split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return `${minutes} min read`;
}

function buildDescription(markdown: string, explicit?: string): string {
  if (explicit?.trim()) {
    return clampText(explicit, 160);
  }

  const firstParagraph = markdown
    .split(/\n{2,}/)
    .map((chunk) => stripMarkdown(chunk))
    .find(Boolean);

  return clampText(firstParagraph || 'Published via Postiz.', 160);
}

function parseTags(tags?: string | string[]): string[] {
  if (Array.isArray(tags)) {
    return tags.map((tag) => tag.trim()).filter(Boolean);
  }

  return (tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeMdxBody(content: string, heroImageUrl: string): string {
  let body = content.replace(/\r\n/g, '\n');

  body = body
    .split('\n')
    .filter((line) => !/^# [^#]/.test(line))
    .join('\n');

  if (heroImageUrl) {
    const escapedHeroUrl = heroImageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const heroLinePattern = new RegExp(
      `^!\\[[^\\]]*]\\(${escapedHeroUrl}\\)\\s*$`
    );
    const lines = body.split('\n');
    const scanLimit = Math.min(lines.length, 8);
    for (let i = 0; i < scanLimit; i++) {
      if (heroLinePattern.test(lines[i])) {
        lines.splice(i, 1);
        break;
      }
    }
    body = lines.join('\n');
  }

  body = body.replace(/^(!\[[^\]]*]\([^)]+\))(\S.*)$/gm, '$1\n\n$2');

  return body.trim() + '\n';
}

export function buildCorvoBlogMdx(
  params: Omit<BlogPostPrParams, 'token' | 'repo' | 'baseBranch' | 'contentDir'>
): string {
  if (!params.heroImageUrl?.trim()) {
    throw new Error('Corvo Labs Blog publishing requires a hero image URL.');
  }

  const body = normalizeMdxBody(params.content, params.heroImageUrl);
  const date = params.date || new Date().toISOString().split('T')[0];
  const tags = params.tags || [];
  const lines = [
    '---',
    `title: "${escapeYamlString(params.title)}"`,
    `date: "${escapeYamlString(date)}"`,
  ];

  if (params.subtitle?.trim()) {
    lines.push(`subtitle: "${escapeYamlString(params.subtitle.trim())}"`);
  }

  lines.push(
    `description: "${escapeYamlString(
      buildDescription(params.content, params.excerpt)
    )}"`,
    `author: "${escapeYamlString(params.author?.trim() || DEFAULT_AUTHOR)}"`,
    `tags: [${tags.map((tag) => `"${escapeYamlString(tag)}"`).join(', ')}]`,
    `heroImage: "${escapeYamlString(params.heroImageUrl.trim())}"`,
    `heroImageAlt: "${escapeYamlString(
      params.heroImageAlt?.trim() || `Cover image for ${params.title}`
    )}"`,
    `readTime: "${escapeYamlString(estimateReadTime(params.content))}"`,
    `category: "${escapeYamlString(
      params.category?.trim() || DEFAULT_CATEGORY
    )}"`,
    `featured: ${params.featured ? 'true' : 'false'}`,
    `status: "${escapeYamlString(params.status?.trim() || 'scheduled')}"`,
    '---',
    '',
    ''
  );

  return lines.join('\n') + body;
}

async function readGitHubJson<T>(
  url: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<{ response: Response; json: T }> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new Error(`${fallbackMessage}: ${JSON.stringify(json)}`);
  }

  return { response, json };
}

async function createBlogPostPR(
  params: BlogPostPrParams
): Promise<BlogPostPrResult> {
  const { owner, name } = parseRepo(params.repo);
  const date = params.date || new Date().toISOString().split('T')[0];
  const slug = `${date}-${slugifyCorvoBlogTitle(params.title)}`;
  const branchName = `postiz/corvo-blog-${slug}`;
  const filePath = `${params.contentDir.replace(/\/$/, '')}/${slug}.mdx`;
  const content = Buffer.from(buildCorvoBlogMdx(params)).toString('base64');
  const headers: GitHubHeaders = {
    Authorization: `Bearer ${params.token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const apiBase = `https://api.github.com/repos/${owner}/${name}`;

  const { json: branchData } = await readGitHubJson<{
    object: { sha: string };
  }>(
    `${apiBase}/git/ref/heads/${encodeURIComponent(params.baseBranch)}`,
    { headers },
    'GitHub base branch fetch failed'
  );

  const createBranchResponse = await fetch(`${apiBase}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: branchData.object.sha,
    }),
  });

  if (!createBranchResponse.ok) {
    const error = await createBranchResponse.json().catch(() => ({}));
    const alreadyExists =
      createBranchResponse.status === 422 &&
      typeof error?.message === 'string' &&
      error.message.toLowerCase().includes('reference already exists');

    if (!alreadyExists) {
      throw new Error(`GitHub create branch failed: ${JSON.stringify(error)}`);
    }
  }

  const existingFileResponse = await fetch(
    `${apiBase}/contents/${encodeGitHubContentPath(
      filePath
    )}?ref=${encodeURIComponent(branchName)}`,
    { headers }
  );
  const existingFile = existingFileResponse.ok
    ? ((await existingFileResponse.json()) as { sha?: string })
    : undefined;

  await readGitHubJson(
    `${apiBase}/contents/${filePath}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `feat: add blog post "${params.title}"`,
        content,
        branch: branchName,
        ...(existingFile?.sha ? { sha: existingFile.sha } : {}),
      }),
    },
    'GitHub create file failed'
  );

  const createPrResponse = await fetch(`${apiBase}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `Blog post: ${params.title}`,
      body: [
        'Publish intent: merge to publish on corvo-labs-dot-com.',
        `Postiz run date: ${date}.`,
        'Vercel preview: pending manual review, if applicable.',
      ].join('\n'),
      head: branchName,
      base: params.baseBranch,
    }),
  });

  if (!createPrResponse.ok) {
    const error = await createPrResponse.json().catch(() => ({}));
    const prAlreadyExists =
      createPrResponse.status === 422 &&
      Array.isArray(error?.errors) &&
      error.errors.some(
        (issue: { message?: string }) =>
          typeof issue.message === 'string' &&
          issue.message.toLowerCase().includes('pull request already exists')
      );

    if (prAlreadyExists) {
      const { json: existingPrs } = await readGitHubJson<
        Array<{ html_url?: string }>
      >(
        `${apiBase}/pulls?state=open&head=${encodeURIComponent(
          `${owner}:${branchName}`
        )}&base=${encodeURIComponent(params.baseBranch)}`,
        { headers },
        'GitHub fetch existing PR failed'
      );
      const existingPr = existingPrs.find((pr) => pr.html_url);
      if (existingPr?.html_url) {
        return { prUrl: existingPr.html_url, branchName, filePath };
      }
    }

    throw new Error(`GitHub create PR failed: ${JSON.stringify(error)}`);
  }

  const prData = (await createPrResponse.json()) as { html_url: string };
  return { prUrl: prData.html_url, branchName, filePath };
}

function getMediaUrl(
  settings: CorvoLabsBlogSettings,
  postDetails: PostDetails[]
): string | undefined {
  const imagePath =
    settings.heroImageUrl ||
    settings.main_image?.path ||
    postDetails[0]?.media?.[0]?.path;
  if (!imagePath) {
    return undefined;
  }

  if (imagePath.startsWith('http')) {
    return imagePath;
  }

  const uploadBase = `${
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || ''
  }/${process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY || ''}`;
  return `${uploadBase.replace(/\/$/, '')}/${imagePath.replace(/^\//, '')}`;
}

function getConnection(
  integration: Integration,
  accessToken: string
): Required<CorvoLabsBlogConnection> {
  let saved = { apiKey: accessToken } as CorvoLabsBlogConnection;

  if (integration.customInstanceDetails) {
    try {
      saved = JSON.parse(
        AuthService.fixedDecryption(integration.customInstanceDetails)
      ) as CorvoLabsBlogConnection;
    } catch (err) {
      saved = { apiKey: accessToken };
    }
  }

  return {
    apiKey: saved.apiKey || accessToken,
    repo: saved.repo?.trim() || process.env.CORVO_BLOG_REPO || DEFAULT_REPO,
    baseBranch:
      saved.baseBranch?.trim() ||
      process.env.CORVO_BLOG_BASE_BRANCH ||
      DEFAULT_BASE_BRANCH,
    contentDir:
      saved.contentDir?.trim() ||
      process.env.CORVO_BLOG_CONTENT_DIR ||
      DEFAULT_CONTENT_DIR,
  };
}

export class CorvoLabsBlogProvider
  extends SocialAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 2;
  identifier = 'corvo-labs-blog';
  name = 'Corvo Labs Blog';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'markdown' as const;
  dto = CorvoLabsBlogDto;

  maxLength() {
    return 100000;
  }

  async customFields() {
    return [
      {
        key: 'apiKey',
        label: 'GitHub token',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
      {
        key: 'repo',
        label: 'Repository',
        defaultValue: DEFAULT_REPO,
        validation: `/^[A-Za-z0-9_.-]+\\/[A-Za-z0-9_.-]+$/`,
        type: 'text' as const,
      },
      {
        key: 'baseBranch',
        label: 'Base branch',
        defaultValue: DEFAULT_BASE_BRANCH,
        validation: `/^[A-Za-z0-9._\\/-]+$/`,
        type: 'text' as const,
      },
      {
        key: 'contentDir',
        label: 'Content directory',
        defaultValue: DEFAULT_CONTENT_DIR,
        validation: `/^[A-Za-z0-9._\\/-]+$/`,
        type: 'text' as const,
      },
    ];
  }

  async generateAuthUrl() {
    const state = makeId(6);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }): Promise<AuthTokenDetails | string> {
    const body = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    ) as CorvoLabsBlogConnection;
    const repo =
      body.repo?.trim() || process.env.CORVO_BLOG_REPO || DEFAULT_REPO;
    const { owner, name } = parseRepo(repo);

    try {
      await readGitHubJson(
        `https://api.github.com/repos/${owner}/${name}`,
        {
          headers: {
            Authorization: `Bearer ${body.apiKey}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
        'GitHub repo fetch failed'
      );

      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: body.apiKey,
        id: repo,
        name: 'Corvo Labs Blog',
        picture: '',
        username: repo,
      };
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid GitHub credentials';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<CorvoLabsBlogSettings>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const firstPost = postDetails[0];
    const settings = firstPost?.settings || ({} as CorvoLabsBlogSettings);
    const connection = getConnection(integration, accessToken);
    const heroImageUrl = getMediaUrl(settings, postDetails);
    const result = await createBlogPostPR({
      token: connection.apiKey,
      repo: connection.repo,
      baseBranch: connection.baseBranch,
      contentDir: connection.contentDir,
      title: settings.title,
      content: firstPost.message,
      date: settings.date,
      status: settings.status,
      subtitle: settings.subtitle,
      excerpt: settings.excerpt,
      author: settings.author,
      tags: parseTags(settings.tags),
      category: settings.category,
      featured: settings.featured,
      heroImageUrl,
      heroImageAlt: settings.heroImageAlt,
    });

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: result.branchName,
        releaseURL: result.prUrl,
      },
    ];
  }
}
