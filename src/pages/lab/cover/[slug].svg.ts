/**
 * /lab/cover/<slug>.svg — a Lab post's cover art, built once per post at
 * build time. The drawing lives in src/lib/lab.ts.
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { coverSvg, getLabPosts, postSlug, type Post } from '@/lib/lab';

export const getStaticPaths: GetStaticPaths = async () =>
  (await getLabPosts()).map((post) => ({ params: { slug: postSlug(post) }, props: { post } }));

export const GET: APIRoute = ({ props }) =>
  new Response(coverSvg((props as { post: Post }).post), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
