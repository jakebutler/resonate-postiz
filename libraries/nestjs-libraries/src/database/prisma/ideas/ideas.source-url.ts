const trackingParams = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^ref$/i,
];

type SourceCandidate = {
  sourceUrl?: string | null;
};

export function normalizeIdeaSourceUrl(sourceUrl?: string) {
  if (!sourceUrl?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(sourceUrl.trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (
      (url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')
    ) {
      url.port = '';
    }

    for (const key of [...url.searchParams.keys()]) {
      if (trackingParams.some((param) => param.test(key))) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';

    const query = url.searchParams.toString();
    return `${url.protocol}//${url.host}${url.pathname}${
      query ? `?${query}` : ''
    }`;
  } catch (err) {
    return sourceUrl.trim();
  }
}

export function findIdeaSourceMatches<T extends SourceCandidate>(
  candidates: T[],
  sourceUrl?: string
) {
  const normalizedSourceUrl = normalizeIdeaSourceUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return {
      normalizedSourceUrl,
      matches: [] as T[],
    };
  }

  return {
    normalizedSourceUrl,
    matches: candidates.filter(
      (idea) =>
        normalizeIdeaSourceUrl(idea.sourceUrl || undefined) ===
        normalizedSourceUrl
    ),
  };
}
