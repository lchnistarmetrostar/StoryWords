export type ContentSource = "ai" | "demo";

export interface Profile {
  level: "A2";
  genre: "mystery";
}

export interface Word {
  id: string;
  text: string;
  meaningZh: string;
}

export interface Quiz {
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
}

export interface VocabularyEntry extends Word {
  quiz: Quiz;
}

export interface Story {
  title: string;
  text: string;
}

export interface Episode extends Story {
  lessonId: string;
  wordId: string;
  source: ContentSource;
}

export interface LessonRequest {
  profile: Profile;
  mode: ContentSource;
  learnedWordIds: string[];
  previousEpisode: Episode | null;
}

export interface ReadyLesson {
  status: "ready";
  lessonId: string;
  source: ContentSource;
  word: Word;
  story: Story;
  quiz: Quiz;
}

export interface CompletedLesson {
  status: "completed";
}

export type LessonResponse = ReadyLesson | CompletedLesson;

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "AI_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_UPSTREAM_ERROR"
  | "INVALID_AI_OUTPUT"
  | "INTERNAL_ERROR";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
  };
}

export interface LearningState {
  version: 1;
  profile: Profile;
  mode: ContentSource;
  learnedWordIds: string[];
  episodes: Episode[];
  currentLesson: ReadyLesson | null;
}

export interface AnswerResult {
  status: "correct" | "incorrect" | "no-active-lesson";
  state: LearningState;
}

// Request-only credentials: never put this object in LearningState or a browser save.
export type ByokProvider = "deepseek" | "openai";
export interface ByokConfig {
  provider: ByokProvider;
  model: string;
  apiKey: string;
}
export interface LessonTransportRequest extends LessonRequest {
  ai?: ByokConfig;
}

export interface DailyPlan {
  version: 1;
  date: string;
  target: number;
  completedWordIds: string[];
  seenWordIds: string[];
}

export interface DailySummary {
  plan: DailyPlan;
  target: number;
  completedToday: number;
  remainingToTarget: number;
  availableNewWords: number;
  maxTarget: number;
  goalReached: boolean;
  courseCompleted: boolean;
}
