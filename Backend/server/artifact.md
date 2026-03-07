# 🔍 Enlighten2Code — Full Codebase Analysis

## What You Already Have (Existing Code — NOT Touched)

| Layer | File | Status |
|-------|------|--------|
| **Auth** | [auth.controllers.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/auth.controllers.js) | ✅ register, login, logout, getCurrentUser, updateProfileImage |
| **Problems** | [problem.controller.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/problem.controller.js) | ✅ CRUD + getAllProblemsSolvedByUser |
| **Submissions** | [submission.controllers.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/submission.controllers.js) | ✅ getAllSubmission, getSubmissionsForProblem, getAllTheSubmissionsForProblem (count) |
| **Execute Code** | [executeCode.controllers.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/executeCode.controllers.js) | ✅ executeCode with Judge0 batch + test case result storage |
| **Playlists** | [playlist.controllers.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/playlist.controllers.js) | ✅ CRUD + add/remove problems |
| **Healthcheck** | [healthcheck.controllers.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/healthcheck.controllers.js) | ✅ simple ping |
| **Middleware** | [auth.middlewares.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/middlewares/auth.middlewares.js) | ✅ verifyJWT, authMiddleware, checkAdmin |
| **Middleware** | [multer.middlewares.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/middlewares/multer.middlewares.js) | ✅ file upload with filter |
| **Utilities** | [cloudinary.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/utils/cloudinary.js) | ✅ upload/delete profile images |
| **Utilities** | [judge0.lib.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/libs/judge0.lib.js) | ✅ submitBatch, pollBatchResults, language maps |
| **Infrastructure** | [logger.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/loggers/logger.js), [APIResponse.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/APIStatuses/APIResponse.js), [APIErrors.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/Errors/APIErrors.js), [AsyncHandler.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/AsyncHandler/AsyncHandler.js), [dbconfig.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/database/dbconfig.js) | ✅ All complete |
| **Entry Point** | [src/index.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/src/index.js) | ✅ Express setup with Helmet, Morgan, CORS, cookie-parser, global error handler |

---

## 🚨 What's Missing / Needs to Be Written

### 1. Prisma Schema — 5 Missing Models

Your current [schema.prisma](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/prisma/schema.prisma) only has **User** and **Problem**, but your controllers already use [Submission](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/submission.controllers.js#3-24), `TestCaseResult`, `ProblemSolved`, [Playlist](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/playlist.controllers.js#80-115), and `ProblemInPlaylist`. These models **must be added**:

```prisma
model Submission {
  id            String   @id @default(uuid())
  userId        String
  problemId     String
  sourceCode    String   @db.Text
  language      String
  stdin         String?  @db.Text
  stdout        String?  @db.Text
  stderr        String?  @db.Text
  compileOutput String?  @db.Text
  status        String   // "Accepted", "Wrong Answer", etc.
  memory        String?
  time          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  problem   Problem        @relation(fields: [problemId], references: [id], onDelete: Cascade)
  testCases TestCaseResult[]
}

model TestCaseResult {
  id            String  @id @default(uuid())
  submissionId  String
  testCase      Int
  passed        Boolean
  stdout        String?
  expected      String?
  stderr        String?
  compileOutput String?
  status        String
  memory        String?
  time          String?

  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
}

model ProblemSolved {
  id        String   @id @default(uuid())
  userId    String
  problemId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)

  @@unique([userId, problemId])
}

model Playlist {
  id          String   @id @default(uuid())
  name        String
  description String?
  userId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user     User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  problems ProblemInPlaylist[]
}

model ProblemInPlaylist {
  id         String @id @default(uuid())
  playListId String
  problemId  String
  createdAt  DateTime @default(now())

  playlist Playlist @relation(fields: [playListId], references: [id], onDelete: Cascade)
  problem  Problem  @relation(fields: [problemId], references: [id], onDelete: Cascade)

  @@unique([playListId, problemId])
}
```

And the **User** and **Problem** models need their back-references added:

```diff
 model User {
   ...
+  submissions   Submission[]
+  solvedProblems ProblemSolved[]
+  playlists     Playlist[]
 }

 model Problem {
   ...
+  submissions Submission[]
+  solvedBy    ProblemSolved[]
+  playlists   ProblemInPlaylist[]
 }
```

---

### 2. Playlist Routes Not Mounted in [index.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/src/index.js)

The [playlist.controllers.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/controllers/playlist.controllers.js) is complete but **never reachable** — there's no route mount:

```javascript
// Missing in src/index.js:
import playlistRoutes from "../routes/playlist.routes.js";  // ← this import is absent
app.use("/api/v1/playlists", playlistRoutes);               // ← this mount is absent
```

Also there is **no** `routes/playlist.routes.js` file at all! A route file needs to be created:

```javascript
// routes/playlist.routes.js
import express from "express";
import { authMiddleware } from "../middlewares/auth.middlewares.js";
import {
  createPlayList,
  getPlayAllListDetails,
  getPlayListDetails,
  addProblemToPlaylist,
  deletePlayList,
  removeProblemFromPlaylist,
} from "../controllers/playlist.controllers.js";

const playlistRoutes = express.Router();

playlistRoutes.post("/create-playlist", authMiddleware, createPlayList);
playlistRoutes.get("/", authMiddleware, getPlayAllListDetails);
playlistRoutes.get("/:playlistId", authMiddleware, getPlayListDetails);
playlistRoutes.post("/:playlistId/add-problems", authMiddleware, addProblemToPlaylist);
playlistRoutes.delete("/:playlistId", authMiddleware, deletePlayList);
playlistRoutes.delete("/:playlistId/remove-problems", authMiddleware, removeProblemFromPlaylist);

export default playlistRoutes;
```

---

### 3. All Socket Files Are Empty (0 bytes)

| File | Status |
|------|--------|
| [Sockets/socketManager.socket.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/Sockets/socketManager.socket.js) | ❌ Empty |
| [Sockets/socketAuthentication.socket.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/Sockets/socketAuthentication.socket.js) | ❌ Empty |
| [Sockets/socketEventHandlers.socket.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/Sockets/socketEventHandlers.socket.js) | ❌ Empty |

---

### 4. All Webhook Files Are Empty (0 bytes)

| File | Status |
|------|--------|
| [webhooks/webhookRoutes.webhook.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/webhooks/webhookRoutes.webhook.js) | ❌ Empty |
| [webhooks/webhookHandlers.webhook.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/webhooks/webhookHandlers.webhook.js) | ❌ Empty |
| [webhooks/webhookVerifier.webhook.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/webhooks/webhookVerifier.webhook.js) | ❌ Empty |
| [webhooks/webhookPreproccessor.webhook.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/webhooks/webhookPreproccessor.webhook.js) | ❌ Empty |

---

### 5. All `src/` Subdirectories Are Empty

| Directory | Status |
|-----------|--------|
| `src/controllers/` | ❌ Empty |
| `src/routes/` | ❌ Empty |
| `src/models/` | ❌ Empty |
| `src/validators/` | ❌ Empty |
| `src/EventHandlers/` | ❌ Empty |

---

### 6. [utils/constants.js](file:///c:/Users/user/OneDrive/Desktop/Enlighten2Code/Backend/server/utils/constants.js) — Empty / Missing

The file exists but appears to have no content. Could house HTTP status codes, error messages, Judge0 config, etc.

---

### 7. Frontend Directory — Completely Empty

`frontend/` exists but has no files at all.

---

## 🎯 Feature Recommendations — Final Year Project Level

Below are features ordered by **impact** and **uniqueness** that will elevate this from "tutorial-level CRUD" to a **real, defensible final year project**:

---

### 🏆 Tier 1 — Must-Have (These differentiate you from generic LeetCode clones)

#### 1. **Real-Time Collaborative Coding Room (Socket.io)**
> Your socket files are already scaffolded. This is the **killer feature**.

- Two or more users join a room by problem ID
- Real-time code sync via operational transforms (or CRDT via Y.js/Yjs)
- Shared cursor positions, live typing indicators
- Voice/video chat integration (WebRTC via simple-peer)
- **Why it matters**: Transforms it from "solo practice" to "pair programming platform" — no LeetCode clone does this well

#### 2. **AI-Powered Hint System & Code Review**
- After a user fails 3+ attempts, offer AI-generated progressive hints (not full solutions)
- Post-submission: AI reviews the code for time complexity, space complexity, variable naming, edge cases
- Use OpenAI / Gemini API with a specialized system prompt
- **Controller**: `aiAssistant.controller.js` with endpoints:
  - `POST /api/v1/ai/hint` — progressive hint based on problem + user's last submission
  - `POST /api/v1/ai/review` — code review for accepted submissions
  - `POST /api/v1/ai/explain` — explain a problem's editorial step-by-step

#### 3. **User Progress Analytics Dashboard**
- Daily/weekly streak tracking (like GitHub contribution graph)
- Problems solved by difficulty breakdown (pie chart data)
- Topic-wise strength/weakness heatmap (e.g., "Strong in Arrays, Weak in DP")
- Time-to-solve trends over time
- Acceptance rate per language
- **Controller**: `analytics.controller.js`
  - `GET /api/v1/analytics/dashboard` — all metrics for current user
  - `GET /api/v1/analytics/streak` — streak calendar data
  - `GET /api/v1/analytics/topic-strength` — per-tag scores

---

### 🥈 Tier 2 — High Impact (Makes it production-grade)

#### 4. **Timed Contest / Assessment Mode**
- Admin creates a contest with N problems and a time limit
- Users register for contests, get a countdown timer
- Auto-submit on timeout
- Live leaderboard (excellent use of your Socket infrastructure)
- Post-contest editorial unlock
- **Models**: `Contest`, `ContestProblem`, `ContestRegistration`, `ContestSubmission`

#### 5. **Discussion Forum per Problem**
- Users can post solutions, ask doubts, upvote/downvote
- Threaded replies
- Admin can pin solutions
- **Models**: `Discussion`, `DiscussionReply`, `Vote`
- **Controller**: `discussion.controller.js`

#### 6. **Code Execution Playground (Run without Submit)**
- "Run Code" button that only tests against custom input (not stored)
- Separate from "Submit" which validates against all test cases
- Currently you only have "Submit" — a "Run" mode is standard in every coding platform

#### 7. **Global & Friends Leaderboard**
- Ranked by: problems solved, contest rating, streak length
- Follow/unfollow other users
- Compare stats side-by-side
- **Models**: `Follow`, computed `LeaderboardEntry`

---

### 🥉 Tier 3 — Nice-to-Have (Adds polish & uniqueness)

#### 8. **Spaced Repetition Review System**
- After solving a problem, schedule it for review in 1 day, 3 days, 1 week, etc.
- "Daily Review" page shows problems due for revision
- Based on SM-2 algorithm (like Anki for code)
- **Unique**: No competitive coding platform does this — great for DSA interview prep angle

#### 9. **Multi-Language Code Template System**
- Currently supports 3 languages (JS, Python, Java)
- Add: C++, Go, Rust, TypeScript, C#
- Auto-generate boilerplate with function signature per language

#### 10. **Problem Difficulty Rating by Users**
- After solving, users vote if difficulty felt "Easy / Medium / Hard"
- Show community-perceived difficulty alongside admin-set difficulty
- Helps identify mislabeled problems

#### 11. **Webhooks for External Integrations**
- Your webhook files are scaffolded but empty
- Implement: notify Slack/Discord on contest start, send email on streak milestone
- Great for showing "system design thinking" in your project defense

#### 12. **Admin Dashboard Endpoints**
- Platform-wide stats: total users, total submissions, acceptance rates
- Flagged submissions (plagiarism detection via code similarity)
- User management (ban/unban)

---

## 📋 Priority Implementation Order

If I were building this as a final year project, I would tackle them in this order:

| Priority | Feature | Why |
|----------|---------|-----|
| **P0** | Fix Prisma schema + mount playlist routes | Nothing works without this |
| **P1** | Real-time collaborative rooms (Sockets) | Your **differentiator** — files are already scaffolded |
| **P2** | Analytics dashboard | Shows data engineering skills |
| **P3** | AI hints & code review | Shows AI/ML integration |
| **P4** | Contest mode | Shows complex state management |
| **P5** | Discussion forum | Shows community features |
| **P6** | Run vs Submit separation | UX essential |
| **P7** | Leaderboard | Gamification |
| **P8** | Spaced repetition | Unique angle |

---

> [!TIP]
> For your project presentation, the **collaborative coding room** + **AI code review** combo tells a powerful story: *"We built a platform where students don't just solve problems alone — they learn together in real-time, and an AI coach guides them when they're stuck."* That's final-year-project-defense gold.
