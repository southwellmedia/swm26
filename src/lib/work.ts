/**
 * Which projects are public, in what order, and where each case study's
 * "next project" door leads. One source for the work grids, the generic
 * case-study template and every hand-built story page, so they can never
 * disagree about what the portfolio contains.
 *
 * A project is listed when it is not a draft and is not told inside another
 * project's story (`parent`). Only listed projects get a card, a page of
 * their own, or a door pointing at them. Everything else stays in
 * src/content/work, unpublished, until its frontmatter changes.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Project = CollectionEntry<'work'>;

export const isListed = ({ data }: Project) => !data.draft && !data.parent;

/** The public portfolio, in grid order. */
export async function getOrderedWork(): Promise<Project[]> {
  const projects = await getCollection('work', isListed);
  return projects.sort((a, b) => a.data.order - b.data.order);
}

/**
 * Where a project's door leads: the next listed project in grid order,
 * wrapping round at the end. A project that is not listed itself (a draft
 * story previewed in development) still gets the one that would follow it.
 */
export function nextProject(ordered: Project[], project: Project): Project {
  const after = ordered.find(
    (candidate) => candidate.id !== project.id && candidate.data.order > project.data.order
  );
  return after ?? ordered.find((candidate) => candidate.id !== project.id) ?? ordered[0];
}

/** For a hand-built story page: its own entry and the project after it. */
export async function getStoryProject(id: string): Promise<{ project: Project; next: Project }> {
  const project = await getEntry('work', id);
  if (!project) throw new Error(`${id} is missing from src/content/work`);
  return { project, next: nextProject(await getOrderedWork(), project) };
}
