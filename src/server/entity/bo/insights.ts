// This module defines input parameter data models (BO) for photo insights and analytics.

export interface PhotoViewRecordBo {
  photoId: string;
  type?: 'view' | 'share' | 'download';
}

export interface InsightsChartQueryBo {
  range?: '7d' | '30d' | '90d';
  photoId?: string;
}
