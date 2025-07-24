
export interface MediaSource {
  id: string;
  name: string;
  url: string;
  duration: number;
  file: File;
  thumbnails?: string[];
}

export interface Clip {
  id:string;
  sourceId: string;
  start: number; 
  end: number;
  sourceStart: number;
  sourceEnd: number;
  playbackRate: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  style: {
    top: string;
    left: string;
    color: string;
    fontSize: string;
  };
}

export type EffectType = 'filter' | 'image_overlay' | 'generative_transition';

export interface Effect {
  id: string;
  type: EffectType;
  start: number;
  end: number;
  value: string; // filter: 'grayscale(100%)', image_overlay: url, transition: 'loading'/'done'
  prompt?: string;
  images?: string[]; // For generative_transition
}

export type TimelineElement = 
  | { type: 'clip'; data: Clip }
  | { type: 'text'; data: TextOverlay }
  | { type: 'effect'; data: Effect }
  | { type: 'media'; data: MediaSource };