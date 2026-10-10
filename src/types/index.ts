export interface Client {
  id: string;
  name: string;
  version: string;
  description: string;
  download_url: string;
  file_size_mb: number;
  tags: string[];
  changelog: string;
  icon_url: string;
  created_at: string;
  updated_at: string;
}

export interface ClientUpdate {
  id: string;
  client_id: string;
  version: string;
  changelog: string;
  created_at: string;
}

export interface Profile {
  id: string;
  username: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export type ViewKey = 'play' | 'catalog' | 'mods' | 'modpacks' | 'versions' | 'import' | 'admin';

export type SkinType = 'classic' | 'slim';

export interface Skin {
  id: string;
  user_id: string;
  skin_url: string;
  skin_type: SkinType;
  active: boolean;
  created_at: string;
}

export type DownloadStatus =
  | 'idle'
  | 'downloading-core'
  | 'installing-mods'
  | 'configuring'
  | 'done';

export interface InstalledClient {
  version: string;
  installedAt: string;
}

export interface ModrinthSearchResult {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  icon_url: string;
  follows: number;
  date_modified: string;
  license: { id: string; name: string; url: string };
  client_side: string;
  server_side: string;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  version_number: string;
  name: string;
  version_type: string;
  loaders: string[];
  game_versions: string[];
  files: {
    url: string;
    filename: string;
    primary: boolean;
    size: number;
    file_type: string;
  }[];
  dependencies: { project_id: string; dependency_type: string }[];
}

export interface ModpackMod {
  project_id: string;
  slug: string;
  title: string;
  icon_url: string;
  version_id: string;
  file_name: string;
  download_url: string;
  categories: string[];
}

export interface Modpack {
  id: string;
  user_id: string;
  name: string;
  description: string;
  mc_version: string;
  loader: string;
  mods: ModpackMod[];
  memory: number;
  java_args: string;
  created_at: string;
  updated_at: string;
}
