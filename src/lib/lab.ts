/**
 * The Lab: the studio's writing (route /blog).
 *
 * One place for what a post is to the rest of the site — its address, its
 * category, its reading time, the word on its cover — and for the cover art
 * itself, which is drawn from the post's slug so every post gets one without
 * anybody making it.
 *
 * The art is a field of dots that pools into a shape and fades out again,
 * the same particle language as the homepage services, lit by one bloom in
 * the category's colour. It is seeded by the slug, so a post's cover never
 * changes between builds, and no two posts share one. It carries no text:
 * the words are set over it in HTML, in the site's own faces.
 */
import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

// --- posts -----------------------------------------------------------------------

/** Published English posts, newest first. Drafts show in development only. */
export async function getLabPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) =>
    import.meta.env.PROD ? data.draft !== true : true
  );
  return posts
    .filter((post) => post.data.locale === 'en')
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

/** The post's slug without the locale folder: `en/foo` -> `foo`. */
export const postSlug = (post: Post) => post.id.replace(/^en\//, '');
export const postUrl = (post: Post) => '/blog/' + postSlug(post);
export const coverUrl = (post: Post) => '/lab/cover/' + postSlug(post) + '.svg';

/** Minutes to read the body at 230 words a minute, code blocks included. */
export function readingTime(post: Post): number {
  const words = (post.body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

/** The short word set large on the cover: `coverWord`, else the first tag. */
export const coverWord = (post: Post) =>
  (post.data.coverWord ?? post.data.tags[0] ?? post.data.category ?? 'lab').toLowerCase();

export const shortDate = (date: Date) =>
  // Front-matter dates are midnight UTC; read them in UTC, or they slip a day
  // west of Greenwich.
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(
    date
  );

// --- categories ------------------------------------------------------------------

export interface Category {
  id: string;
  label: string;
  /** The field the art sits on. */
  ground: string;
  /** The bloom, and the few dots that catch it. */
  accent: string;
  /** The dots. */
  ink: string;
}

const CATEGORIES: Record<string, Category> = {
  insights: {
    id: 'insights',
    label: 'Insights',
    ground: '#0c1016',
    accent: '#ff542e',
    ink: '#eef2f4',
  },
  development: {
    id: 'development',
    label: 'Development',
    ground: '#0d141b',
    accent: '#6fa8d6',
    ink: '#e3ebf1',
  },
  security: {
    id: 'security',
    label: 'Security',
    ground: '#140c0c',
    accent: '#ff3b30',
    ink: '#f4e9e7',
  },
};

const FALLBACK: Category = { ...CATEGORIES.insights, id: 'notes', label: 'Notes' };

export const categoryOf = (post: Post): Category =>
  CATEGORIES[post.data.category ?? ''] ?? FALLBACK;

// --- cover art -------------------------------------------------------------------

/** A small, fast, seedable PRNG (mulberry32) keyed by a string. */
function random(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1600;
const H = 1000;
const STEP = 26;

const f1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The cover as an SVG document, 16:10. Cropped by its containers with
 * object-fit, so the composition keeps its weight right of centre, where
 * the overlaid words are not.
 */
export function coverSvg(post: Post): string {
  const rand = random(postSlug(post));
  const cat = categoryOf(post);

  // Two kinds of cover, so a page of them never repeats itself: a "mass",
  // where the dots gather into a few soft shapes, and a "wave", where a
  // ripple runs through the field and the shapes only swell it.
  const wave = rand() < 0.45;

  // The shapes, kept clear of the lower left, where the cover word sits.
  const masses = Array.from({ length: 3 }, (_, i) => ({
    x: W * (0.5 + rand() * 0.38),
    y: H * (0.22 + rand() * 0.5),
    sx: (i === 0 ? 230 : 120) + rand() * 120,
    sy: (i === 0 ? 200 : 110) + rand() * 120,
    w: (i === 0 ? 0.9 : 0.45 + rand() * 0.3) * (wave ? 0.6 : 1),
  }));
  const phase = rand() * Math.PI * 2;
  const freq = (wave ? 0.011 : 0.007) + rand() * 0.005;
  const amp = wave ? 0.34 : 0.12;
  const tilt = rand() * Math.PI;

  const dots: string[] = [];
  const lit: string[] = [];
  for (let y = STEP / 2; y < H; y += STEP) {
    for (let x = STEP / 2; x < W; x += STEP) {
      let field = 0;
      for (const m of masses) {
        field += m.w * Math.exp(-((x - m.x) ** 2 / (2 * m.sx ** 2) + (y - m.y) ** 2 / (2 * m.sy ** 2)));
      }
      const u = x * Math.cos(tilt) + y * Math.sin(tilt);
      // The ripple only lives where the field is, fading out to the left.
      field += amp * Math.sin(u * freq + phase) * Math.min(1, x / (W * 0.55));
      field += (rand() - 0.5) * 0.05;
      const t = (field - 0.24) / 0.7;
      if (t <= 0.06) continue;
      const r = 1 + 6 * Math.min(1, t);
      const circle = `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
      // Only the very heart of the densest shape catches the accent.
      if (t > 0.9 && rand() < 0.22) lit.push(circle);
      else dots.push(circle);
    }
  }

  const bloom = masses[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="b" cx="${f1((bloom.x / W) * 100)}%" cy="${f1((bloom.y / H) * 100)}%" r="62%">
<stop offset="0" stop-color="${cat.accent}" stop-opacity="0.42"/>
<stop offset="0.45" stop-color="${cat.accent}" stop-opacity="0.1"/>
<stop offset="1" stop-color="${cat.accent}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="v" cx="50%" cy="45%" r="75%">
<stop offset="0.55" stop-color="#000" stop-opacity="0"/>
<stop offset="1" stop-color="#000" stop-opacity="0.55"/>
</radialGradient>
<filter id="g" x="0" y="0" width="100%" height="100%">
<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/>
</filter>
</defs>
<rect width="${W}" height="${H}" fill="${cat.ground}"/>
<rect width="${W}" height="${H}" fill="url(#b)"/>
<g fill="${cat.ink}" fill-opacity="0.78">${dots.join('')}</g>
<g fill="${cat.accent}">${lit.join('')}</g>
<rect width="${W}" height="${H}" fill="url(#v)"/>
<rect width="${W}" height="${H}" filter="url(#g)"/>
</svg>`;
}
