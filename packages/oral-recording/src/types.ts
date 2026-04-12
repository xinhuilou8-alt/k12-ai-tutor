// ===== Audio Recording Types =====

/** Type of oral recording */
export type RecordingType = 'reading' | 'recitation' | 'oral_math' | 'english_reading';

/** Detailed scoring breakdown for an audio recording */
export interface RecordingDetails {
  fluencyScore: number;      // 0-100
  accuracyScore: number;     // 0-100
  missingWords: string[];
  stutterCount: number;
}

/** A single audio recording entry */
export interface AudioRecording {
  id: string;
  childId: string;
  type: RecordingType;
  audioUrl: string;
  duration: number;          // seconds
  score: number;             // 0-100 overall score
  details: RecordingDetails;
  contentId?: string;        // optional: identifies the content (e.g. poem id, passage id)
  createdAt: Date;
}

/** Filters for querying recordings */
export interface RecordingFilters {
  type?: RecordingType;
  startDate?: Date;
  endDate?: Date;
  contentId?: string;
}

/** Date range for report generation */
export interface DateRange {
  start: Date;
  end: Date;
}

/** A single data point in a fluency trend */
export interface FluencyTrendPoint {
  date: Date;
  fluencyScore: number;
  accuracyScore: number;
  overallScore: number;
}

/** Quantitative oral assessment report (Req 30.2) */
export interface OralAssessmentReport {
  childId: string;
  period: DateRange;
  totalRecordings: number;
  averageProficiency: number;       // 0-100
  averageMissingWordRate: number;   // 0-1 ratio
  averageStutterCount: number;
  fluencyTrend: FluencyTrendPoint[];
  byType: Record<string, TypeSummary>;
}

/** Per-type summary within a report */
export interface TypeSummary {
  count: number;
  averageScore: number;
  averageFluency: number;
  averageAccuracy: number;
}

/** Result of comparing two recordings */
export interface RecordingComparison {
  earlier: AudioRecording;
  later: AudioRecording;
  scoreDelta: number;
  fluencyDelta: number;
  accuracyDelta: number;
  stutterDelta: number;
  missingWordsDelta: number;
  improved: boolean;
}
