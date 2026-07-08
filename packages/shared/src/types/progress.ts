export interface ReadingProgress {
  bookId: string;
  userId: string;
  location: string;
  percentage: number;
  updatedAt: string;
}

export interface UpdateProgressRequest {
  location: string;
  percentage: number;
}
