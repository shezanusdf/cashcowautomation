import { VideoCategory } from './types';

export const VIDEO_CATEGORIES: { id: VideoCategory; label: string; description: string }[] = [
  {
    id: 'motivation',
    label: 'Motivation Footage',
    description: 'Inspirational and motivational clips'
  },
  {
    id: 'gym',
    label: 'Gym Footage',
    description: 'Workout and fitness related content'
  },
  {
    id: 'money',
    label: 'Money Footage',
    description: 'Financial success and wealth visuals'
  },
  {
    id: 'houses',
    label: 'Houses Footage',
    description: 'Luxury homes and real estate'
  },
  {
    id: 'women',
    label: 'Women Footage',
    description: 'Female lifestyle and success stories'
  },
  {
    id: 'cars',
    label: 'Cars Footage',
    description: 'Luxury and sports vehicles'
  }
];
