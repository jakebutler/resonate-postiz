import {
  buildCorvoBlogMdx,
  slugifyCorvoBlogTitle,
} from '@gitroom/nestjs-libraries/integrations/social/corvo-labs-blog.provider';

describe('CorvoLabsBlogProvider helpers', () => {
  it('builds stable blog slugs', () => {
    expect(slugifyCorvoBlogTitle('FreshProof: Claim Validation, v2!')).toBe(
      'freshproof-claim-validation-v2'
    );
  });

  it('builds Corvo blog MDX frontmatter', () => {
    const mdx = buildCorvoBlogMdx({
      title: 'A sharper content loop',
      content:
        '# A sharper content loop\n\nThis is the first paragraph.\n\n## Next\n\nBody.',
      date: '2026-06-05',
      heroImageUrl: 'https://example.com/hero.png',
      heroImageAlt: 'Abstract content workflow diagram',
      tags: ['strategy', 'ai'],
      category: 'operations',
      featured: true,
    });

    expect(mdx).toContain('title: "A sharper content loop"');
    expect(mdx).toContain('date: "2026-06-05"');
    expect(mdx).toContain('tags: ["strategy", "ai"]');
    expect(mdx).toContain('heroImage: "https://example.com/hero.png"');
    expect(mdx).toContain('featured: true');
    expect(mdx).not.toContain('# A sharper content loop');
    expect(mdx).toContain('This is the first paragraph.');
  });
});
