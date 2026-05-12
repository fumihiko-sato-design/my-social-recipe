export interface Collection {
  id: string;
  name: string;
  ownerId: string;
  collaborators: string[];
  isPublic: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface SocialLink {
  id: string;
  url: string;
  platform: string;
  title: string;
  notes: string;
  tags: string[];
  contentType: string;
  collectionId: string;
  userId: string;
  rating?: number;
  createdAt: any;
  updatedAt: any;
}

export type Platform = 'facebook' | 'tiktok' | 'instagram' | 'youtube' | 'x' | 'other';

export interface HistoryItem {
  id: string;
  userId: string;
  linkId: string;
  action: 'added' | 'viewed' | 'clicked';
  timestamp: any;
  linkTitle?: string; // Cache title for history view
}
