import {
  findIdeaSourceMatches,
  normalizeIdeaSourceUrl,
} from '@gitroom/nestjs-libraries/database/prisma/ideas/ideas.source-url';

describe('normalizeIdeaSourceUrl', () => {
  it('removes tracking parameters and normalizes source URLs', () => {
    expect(
      normalizeIdeaSourceUrl(
        ' HTTPS://www.Example.com/path/?utm_source=x&b=2&a=1&fbclid=abc#frag '
      )
    ).toBe('https://example.com/path?a=1&b=2');
  });

  it('keeps non-url source text as trimmed input', () => {
    expect(normalizeIdeaSourceUrl('  notes from a call  ')).toBe(
      'notes from a call'
    );
  });

  it('returns undefined for blank source URLs', () => {
    expect(normalizeIdeaSourceUrl('   ')).toBeUndefined();
  });
});

describe('findIdeaSourceMatches', () => {
  it('returns candidates with matching normalized source URLs', () => {
    const result = findIdeaSourceMatches(
      [
        {
          id: 'matching-idea',
          sourceUrl:
            'https://example.com/path?b=2&utm_source=newsletter&a=1#section',
        },
        {
          id: 'other-idea',
          sourceUrl: 'https://example.com/other?a=1&b=2',
        },
        {
          id: 'blank-source',
          sourceUrl: null,
        },
      ],
      'https://www.example.com/path/?a=1&b=2&utm_campaign=launch'
    );

    expect(result.normalizedSourceUrl).toBe('https://example.com/path?a=1&b=2');
    expect(result.matches).toEqual([
      {
        id: 'matching-idea',
        sourceUrl:
          'https://example.com/path?b=2&utm_source=newsletter&a=1#section',
      },
    ]);
  });

  it('returns no matches for blank source URLs', () => {
    expect(
      findIdeaSourceMatches(
        [
          {
            id: 'other-idea',
            sourceUrl: 'https://example.com/other?a=1&b=2',
          },
        ],
        '  '
      )
    ).toEqual({
      normalizedSourceUrl: undefined,
      matches: [],
    });
  });
});
