# Video Survey Platform

A privacy-first video survey platform where users answer 5 Yes/No questions while their camera records face detection data.

---

## Architecture Overview

```
┌─────────────┐    HTTP     ┌──────────────┐    SQLAlchemy   ┌────────────┐
│  Next.js    │ ──────────► │   FastAPI    │ ──────────────► │ PostgreSQL │
│  Frontend   │             │   Backend    │                  └────────────┘
│  (port 3000)│             │  (port 8000) │
└─────────────┘             └──────────────┘
                                   │
                                   ▼ filesystem
                             media/videos/
                             media/images/
```

**Frontend (Next.js)**
- `/admin` — Create surveys (add 5 questions, publish)
- `/survey/[id]` — User-facing survey with camera + face detection

**Backend (FastAPI)**
- REST API for survey/submission management
- Stores metadata in PostgreSQL, files on filesystem
- Export endpoint returns a ZIP file

**Face Detection**
- Uses `face-api.js` (TinyFaceDetector model)
- Runs in browser every 500ms on the live video feed
- Detects: no face → error, multiple faces → error, single face → score (0–100)
- Score = face detection confidence × 100

---

## Setup Instructions

### Prerequisites
- Docker & Docker Compose

### Run with Docker

```bash
git clone https://github.com/Indrajit-Mandol/video-survey-platform.git
cd video-survey-platform
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Run locally (without Docker)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/surveydb uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

> **Note:** Download face-api.js TinyFaceDetector models and place in `frontend/public/models/`:
> - `tiny_face_detector_model-weights_manifest.json`
> - `tiny_face_detector_model-shard1`
>
> Download from: https://github.com/vladmandic/face-api/tree/master/model

---

## User Flow

1. Admin goes to `/admin` → creates survey → adds 5 questions → publishes
2. Admin shares `/survey/{id}` link
3. User opens link → grants camera → answers 5 questions (Yes/No)
4. After each answer: face is validated, snapshot saved, score recorded
5. Completion screen shows summary + ZIP export link

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/surveys` | Create survey |
| POST | `/api/surveys/{id}/questions` | Add question |
| GET | `/api/surveys/{id}` | Get survey + questions |
| POST | `/api/surveys/{id}/publish` | Publish survey |
| POST | `/api/surveys/{id}/start` | Start submission (captures metadata) |
| POST | `/api/submissions/{id}/answers` | Save answer + face snapshot |
| POST | `/api/submissions/{id}/media` | Upload full session video |
| POST | `/api/submissions/{id}/complete` | Mark complete + overall score |
| GET | `/api/submissions/{id}/export` | Download ZIP export |

---

## Database Schema

```
surveys
  id, title, is_active, created_at

survey_questions
  id, survey_id, question_text, order

survey_submissions
  id, survey_id, ip_address, device, browser, os, location,
  started_at, completed_at, overall_score

survey_answers
  id, submission_id, question_id, answer, face_detected,
  face_score, face_image_path

media_files
  id, submission_id, type, path, created_at
```

---

## Metadata Collected (No PII)

| Field | Source |
|-------|--------|
| IP address | FastAPI request |
| Browser | User-Agent parsing |
| Device | User-Agent parsing |
| OS | User-Agent parsing |
| Location | ip-api.com free lookup |
| Timestamps | Server time |

No name, email, phone, or personal identifiers are collected.

---

## Export ZIP Structure

```
submission_{id}.zip
├── metadata.json
├── videos/
│   └── full_session.webm
└── images/
    ├── q1_face.png
    ├── q2_face.png
    ├── q3_face.png
    ├── q4_face.png
    └── q5_face.png
```

---

## Trade-offs & Design Decisions

1. **face-api.js TinyFaceDetector** — Chosen for simplicity and browser-native execution. Runs entirely client-side, no server GPU needed. Trade-off: slightly less accurate than MediaPipe but much easier to set up.

2. **No authentication on admin** — Kept simple per assignment scope. In production, admin routes would require auth.

3. **Video stored as .webm** — Browser MediaRecorder API natively outputs webm. Converting to .mp4 would require FFmpeg on the server.

4. **User-Agent parsing is manual** — Avoids external library dependency. Good enough for device/browser/OS detection.

5. **ip-api.com for geolocation** — Free, no API key needed. Trade-off: rate limited (45 req/min). Production would use MaxMind or similar.

6. **Overall score = average of face scores** — Simple and explainable. Could be weighted differently in production.

---

## Known Limitations

- Models for face-api.js must be manually downloaded and placed in `public/models/`
- Video is webm format (not mp4) — depends on browser support
- No retry logic on API failures in the frontend
- ip-api.com geolocation doesn't work for localhost/127.0.0.1
- No admin authentication
