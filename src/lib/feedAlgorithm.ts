import type { Post } from '@/types';

export function extractHashtags(text: string): string[] {
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(tags.map((tag) => tag.slice(1).toLowerCase()))].slice(0, 12);
}

export function rankFeed(posts: Post[], followingIds: Set<string>, savedIds: Set<string>): Post[] {
  const now = Date.now();
  return [...posts]
    .map((post) => {
      const ageHours = Math.max(0, (now - new Date(post.created_at).getTime()) / 3600000);
      const recency = Math.max(0, 1 - ageHours / 96);
      const engagement = Math.log1p((post.like_count || 0) * 2 + (post.comment_count || 0) * 3);
      const social = followingIds.has(post.user_id) ? 2.5 : 0;
      const saved = savedIds.has(post.id) ? 1.25 : 0;
      const media = post.image_url || (post.media_urls && post.media_urls.length) ? 0.35 : 0;
      return { post, score: recency * 4 + engagement + social + saved + media };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ post }) => post);
}
