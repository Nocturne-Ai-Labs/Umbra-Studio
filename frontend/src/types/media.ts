export interface ImageItem {
  id?: string;
  name: string;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  type?: 'image' | 'video' | 'gif';
  width?: number;
  height?: number;
  size?: number;
  dateCreated?: string;
  dateModified?: string;
}
