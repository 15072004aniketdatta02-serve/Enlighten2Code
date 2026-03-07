// ─── HTTP Status Codes ──────────────────────────────────────
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ─── Common Error Messages ──────────────────────────────────
export const ERROR_MESSAGES = {
  UNAUTHORIZED: "Unauthorized — No token provided",
  INVALID_TOKEN: "Unauthorized — Invalid or expired token",
  FORBIDDEN: "You do not have permission to perform this action",
  NOT_FOUND: "Resource not found",
  INTERNAL_ERROR: "Internal server error",
  VALIDATION_ERROR: "Validation error — check your input",
  RATE_LIMIT: "Too many requests — please slow down",
  USER_NOT_FOUND: "User not found",
  USER_EXISTS: "User with this email already exists",
  PROBLEM_NOT_FOUND: "Problem not found",
  CONTEST_NOT_FOUND: "Contest not found",
  CONTEST_NOT_STARTED: "Contest has not started yet",
  CONTEST_ENDED: "Contest has already ended",
  ALREADY_REGISTERED: "You are already registered for this contest",
  DISCUSSION_NOT_FOUND: "Discussion not found",
  INVALID_DIFFICULTY: "Difficulty must be EASY, MEDIUM, or HARD",
  MISSING_FIELDS: "Missing required fields",
};

// ─── Judge0 Language Configuration ──────────────────────────
export const JUDGE0_LANGUAGES = {
  JAVASCRIPT: { id: 63, name: "JavaScript", monacoId: "javascript" },
  PYTHON: { id: 71, name: "Python", monacoId: "python" },
  JAVA: { id: 62, name: "Java", monacoId: "java" },
  CPP: { id: 54, name: "C++", monacoId: "cpp" },
  C: { id: 50, name: "C", monacoId: "c" },
  TYPESCRIPT: { id: 74, name: "TypeScript", monacoId: "typescript" },
  GO: { id: 60, name: "Go", monacoId: "go" },
  RUST: { id: 73, name: "Rust", monacoId: "rust" },
  CSHARP: { id: 51, name: "C#", monacoId: "csharp" },
};

// ─── Submission Statuses ────────────────────────────────────
export const SUBMISSION_STATUS = {
  ACCEPTED: "Accepted",
  WRONG_ANSWER: "Wrong Answer",
  TIME_LIMIT_EXCEEDED: "Time Limit Exceeded",
  MEMORY_LIMIT_EXCEEDED: "Memory Limit Exceeded",
  RUNTIME_ERROR: "Runtime Error",
  COMPILATION_ERROR: "Compilation Error",
  PENDING: "Pending",
};

// ─── Contest Statuses ───────────────────────────────────────
export const CONTEST_STATUS = {
  UPCOMING: "UPCOMING",
  ACTIVE: "ACTIVE",
  ENDED: "ENDED",
};

// ─── Spaced Repetition Intervals (SM-2 inspired, in days) ───
export const SR_INTERVALS = [1, 3, 7, 14, 30, 60, 120];

// ─── Vote Types ─────────────────────────────────────────────
export const VOTE_TYPE = {
  UPVOTE: "UPVOTE",
  DOWNVOTE: "DOWNVOTE",
};

// ─── Pagination Defaults ────────────────────────────────────
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
