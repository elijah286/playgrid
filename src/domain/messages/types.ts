/**
 * Shared types + constants for the team-chat feature. Lives outside the
 * action file because Next.js "use server" modules can only export async
 * functions — constants and type aliases would crash the build with
 * "Only async functions are allowed to be exported in a 'use server' file."
 *
 * Importing from here is safe in both server actions and client components.
 */

export type PlaybookMessageAuthor = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type PlaybookMessageRow = {
  id: string;
  playbookId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  author: PlaybookMessageAuthor | null;
};

/** Maximum body length — kept in sync with the migration check constraint. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Window in which the author can edit / soft-delete their own message. */
export const AUTHOR_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Page size for the initial fetch. Older messages can be loaded via cursor. */
export const MESSAGE_PAGE_SIZE = 50;
