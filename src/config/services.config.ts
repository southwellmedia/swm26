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
    desc: 'Your business has outgrown its website, or the spreadsheets behind it. I build websites and applications around how you actually work.',
  },
  {
    num: '02',
    title: ['MVPs &', 'Prototypes'],
    theme: 'mid',
    tags: ['Rapid Prototyping', 'Proof of Concept', 'Feature Validation'],
    desc: 'You have an idea and important assumptions to test. I build a focused first version so you can learn before committing to the full product.',
  },
  {
    num: '03',
    title: ['Brand &', 'Design'],
    theme: 'ink',
    tags: ['Brand Identity', 'UI/UX Design', 'Motion & Video'],
    desc: 'Your business has grown, and your identity should show it. I connect brand, interface and content into one consistent experience.',
  },
  {
    num: '04',
    title: ['Technical', 'Advisory'],
    theme: 'shade',
    tags: ['Technical Audits', 'Growth Strategy', 'Digital Operations'],
    desc: "Something isn't working, and you need clarity before investing in the next build. I assess what exists and help you decide what to improve.",
  },
];
