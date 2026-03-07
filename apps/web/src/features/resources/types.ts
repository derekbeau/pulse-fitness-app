export type ResourceType = 'program' | 'book' | 'creator';

export type LinkedExercise = {
  id: string;
  name: string;
};

export type LinkedProtocol = {
  id: string;
  name: string;
  conditionName: string;
  conditionSlug: string;
};

export type Resource = {
  id: string;
  title: string;
  type: ResourceType;
  author: string;
  description: string;
  tags: string[];
  principles: string[];
  linkedExercises: LinkedExercise[];
  linkedProtocols: LinkedProtocol[];
};
