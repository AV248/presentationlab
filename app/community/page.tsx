import { CommunityPage } from '@/screens/CommunityPage';
import { routeMetadata } from '@/lib/routeMeta';
import { readCommunityPosts } from '@/server/community';

export const revalidate = 60;
export const metadata = routeMetadata('/community');

export default async function Page() {
  const posts = await readCommunityPosts(100);
  return <CommunityPage initialPosts={posts.map((post) => ({
    ...post,
    createdMs: post.createdAt ? new Date(post.createdAt).getTime() : 0,
  }))} />;
}
