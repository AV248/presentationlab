export interface PublicCommunityPost {
  id: string;
  title: string;
  body: string;
  author: string;
  uid: string;
  createdAt: string;
  updatedAt: string;
}

const EMAIL_ADDRESS = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/u;

/** Public names must never use an account email as an author label. */
export function publicCommunityAuthor(value: unknown): string {
  const author = typeof value === 'string' ? value.trim() : '';
  return !author || EMAIL_ADDRESS.test(author) ? 'Anonymous' : author;
}

export function communityPostPath(post: Pick<PublicCommunityPost, 'id'>): string {
  return `/community/${encodeURIComponent(post.id)}`;
}
