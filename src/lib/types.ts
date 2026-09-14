export type StoredFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export type Item = {
  id: string;
  text: string | null;
  files: StoredFile[];
  createdAt: string;
};

export type SessionInfo = {
  authed: boolean;
  /** true while the factory-default password (12345) is still in use */
  isDefault: boolean;
};

export type ApiError = { error: string };
