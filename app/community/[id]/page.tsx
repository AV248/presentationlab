import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { communityPostPath } from '@/lib/community';
import { absoluteUrl } from '@/lib/seo';
import { readCommunityPost, readCommunityPosts } from '@/server/community';

export async function generateStaticParams() {
  const posts = await readCommunityPosts(200);
  return posts.map((post) => ({ id: post.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await readCommunityPost(id);
  if (!post) return { title: 'Community post not found', robots: { index: false, follow: false } };
  const path = communityPostPath(post);
  const title = `${post.title} · Community · Presentation Buddy`;
  const description = (post.body.replace(/\s+/g, ' ').trim() || `A community note by ${post.author}.`).slice(0, 158);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { type: 'article', title, description, url: path },
    twitter: { card: 'summary', title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await readCommunityPost(id);
  if (!post) notFound();
  const path = communityPostPath(post);
  const url = absoluteUrl(path);
  const related = (await readCommunityPosts(200))
    .filter((entry) => entry.id !== post.id && entry.author === post.author)
    .slice(0, 4);
  const description = (post.body.replace(/\s+/g, ' ').trim() || `A community note by ${post.author}.`).slice(0, 158);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: post.title,
      articleBody: post.body,
      description,
      url,
      mainEntityOfPage: url,
      datePublished: post.createdAt || undefined,
      dateModified: post.updatedAt || post.createdAt || undefined,
      author: { '@type': 'Person', name: post.author },
      isPartOf: { '@type': 'CollectionPage', name: 'Presentation Buddy Community', url: absoluteUrl('/community') },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Community', item: absoluteUrl('/community') },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ];

  return (
    <div className="pb-page pb-community-post">
      <JsonLd data={jsonLd} />
      <nav aria-label="Breadcrumb" className="pb-muted" style={{ fontSize: '0.82rem' }}>
        <a href="/">Home</a> <span aria-hidden="true"> / </span>
        <a href="/community">Community</a> <span aria-hidden="true"> / </span>
        <span aria-current="page">{post.title}</span>
      </nav>
      <article className="pb-panel pb-community-post-body" style={{ padding: 'clamp(22px, 5vw, 44px)' }}>
        <span className="pb-eyebrow">Open mic · {post.author}</span>
        <h1 className="pb-page-title" style={{ marginTop: 8 }}>{post.title}</h1>
        <p className="pb-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
          {post.createdAt ? new Date(post.createdAt).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' }) : 'Community post'}
        </p>
        <div className="pb-prose pb-community-post-copy" style={{ marginTop: 24 }}>
          {post.body.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} style={{ whiteSpace: 'pre-wrap' }}>{paragraph}</p>
          ))}
        </div>
      </article>
      <nav className="pb-public-index-footer" aria-label="Related community pages">
        <a className="pb-btn pb-btn-ghost" href="/community">Back to the open mic</a>
        <a className="pb-btn pb-btn-ghost" href="/topics">Speaking guides</a>
        {related.map((entry) => (
          <a key={entry.id} className="pb-btn pb-btn-ghost" href={communityPostPath(entry)}>{entry.title}</a>
        ))}
      </nav>
    </div>
  );
}

export const dynamicParams = true;
export const revalidate = 60;
