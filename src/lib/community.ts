export interface PublicCommunityPost {
  id: string;
  title: string;
  body: string;
  author: string;
  uid: string;
  createdAt: string;
  updatedAt: string;
}

export function communityPostPath(post: Pick<PublicCommunityPost, 'id'>): string {
  return `/community/${encodeURIComponent(post.id)}`;
}
