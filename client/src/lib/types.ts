export type VideoCategory = 'motivation' | 'gym' | 'money' | 'houses' | 'women' | 'cars' | 'hooks';

export interface VideoClip {
  id: number;
  name: string;
  category: string;
  url: string;
  duration: string;
  createdAt: string;
}

export interface GeneratedVideo {
  id: number;
  script: string;
  category: VideoCategory;
  useHook: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  error?: string;
  createdAt: string;
  progress?: number; // Add progress field
}