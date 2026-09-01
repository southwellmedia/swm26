/**
 * Services
 *
 * The four scroll-stacking cards on the homepage. Kept in config rather than a
 * content collection: there are four of them, they have no bodies, no dates and
 * no pages of their own — the shape is structural, not editorial.
 */

export interface Service {
  num: string;
  /** Heading is set on two lines, exactly as designed. */
  title: [string, string];
  tags: string[];
  desc: string;
  /** Card colourway. */
  theme: 'white' | 'mid' | 'ink' | 'shade';
}

export const services: Service[] = [
  {
    num: '01',
    title: ['Custom', 'Development'],
    theme: 'white',
    tags: ['Web Development', 'App Development', 'Full-Stack', 'CMS'],
    desc: 'Original digital experiences engineered to grow alongside your operation. Astro, React, Next.js — the stack follows the problem, never our convenience.',
  },
  {
    num: '02',
    title: ['MVPs &', 'Prototypes'],
    theme: 'mid',
    tags: ['Rapid Prototyping', 'Proof of Concept', 'Feature Validation'],
    desc: 'You bring the napkin sketch or the deck with gaps. We turn fragments into working software — validation before commitment.',
  },
  {
    num: '03',
    title: ['Brand &', 'Design'],
    theme: 'ink',
    tags: ['Brand Identity', 'UI/UX Design', 'Motion & Video'],
    desc: 'Design that communicates before anyone reads a word. Every asset shares a common origin — and it shows.',
  },
  {
    num: '04',
    title: ['Technical', 'Advisory'],
    theme: 'shade',
    tags: ['Technical Audits', 'Growth Strategy', 'Digital Operations'],
    desc: "Sometimes the answer isn't a new build — it's diagnosis. We locate friction points and map the path from where you are to where you want to be.",
  },
];
