// Shared DTO for revision data — passed from server to client components.
export type RevisionDTO = {
  id: string;
  number: number;
  authorName: string;
  message: string | null;
  source: string;
  format: string;
  kind: string;
  originalName: string | null;
  createdAt: string;
};
