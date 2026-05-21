import type { ProjectCardViewModel } from '@app/features/profile/components/project-card/project-card.component';

export type ProjectTypeFilter = 'all' | 'public' | 'private' | 'forked';
export type ProjectSortOption = 'updated' | 'created';

export function getProfilePageSize(windowWidth: number): number {
  return windowWidth <= 600 ? 3 : 8;
}

export function filterProfileProjects(
  projects: ProjectCardViewModel[],
  query: string,
  typeFilter: ProjectTypeFilter,
): ProjectCardViewModel[] {
  const normalizedQuery = query.trim().toLowerCase();

  return projects.filter((project) => {
    const matchesSearch = !normalizedQuery || project.name.toLowerCase().includes(normalizedQuery);
    const matchesType =
      typeFilter === 'all'
        ? true
        : typeFilter === 'public'
          ? project.isPublic
          : typeFilter === 'private'
            ? !project.isPublic
            : !!project.forkedFromProjectId;

    return matchesSearch && matchesType;
  });
}

export function sortProfileProjects(
  projects: ProjectCardViewModel[],
  sortOption: ProjectSortOption,
): ProjectCardViewModel[] {
  const sortedProjects = [...projects];
  return sortOption === 'created'
    ? sortedProjects.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    : sortedProjects.sort((left, right) => right.lastEdited.getTime() - left.lastEdited.getTime());
}

export function buildVisiblePageItems(totalPages: number, currentPage: number): Array<number | '...'> {
  if (totalPages <= 3) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 1, totalPages - 2));
  const end = Math.min(totalPages, start + 2);
  const items: Array<number | '...'> = [];

  if (start > 1) {
    items.push('...');
  }

  for (let page = start; page <= end; page++) {
    items.push(page);
  }

  if (end < totalPages) {
    items.push('...');
  }

  return items;
}
