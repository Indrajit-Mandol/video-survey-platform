from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Survey, SurveySubmission, SurveyAnswer, SurveyQuestion, MediaFile
from app.schemas.schemas import StartSubmissionOut, CompleteSubmission
from datetime import datetime, timezone
import httpx, os, shutil, zipfile, json

router = APIRouter()


def parse_user_agent(ua: str):
    """Simple User-Agent parsing without external library."""
    device = "Desktop"
    if any(m in ua for m in ["Mobile", "Android", "iPhone"]):
        device = "Mobile"
    elif "Tablet" in ua or "iPad" in ua:
        device = "Tablet"

    browser = "Unknown"
    if "Chrome" in ua and "Edg" not in ua:
        browser = "Chrome"
    elif "Firefox" in ua:
        browser = "Firefox"
    elif "Safari" in ua and "Chrome" not in ua:
        browser = "Safari"
    elif "Edg" in ua:
        browser = "Edge"

    os_name = "Unknown"
    if "Windows" in ua:
        os_name = "Windows"
    elif "Android" in ua:
        os_name = "Android"
    elif "iPhone" in ua or "iPad" in ua or "Mac" in ua:
        os_name = "iOS/macOS"
    elif "Linux" in ua:
        os_name = "Linux"

    return device, browser, os_name


async def get_location(ip: str) -> str:
    """Get country/city from IP using free API."""
    try:
        if ip in ("127.0.0.1", "::1", "localhost"):
            return "Local"
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"http://ip-api.com/json/{ip}?fields=country,city")
            data = res.json()
            return f"{data.get('city', '')}, {data.get('country', '')}".strip(", ")
    except Exception:
        return "Unknown"


@router.post("/surveys/{survey_id}/start", response_model=StartSubmissionOut)
async def start_submission(survey_id: int, request: Request, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.id == survey_id, Survey.is_active == True).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found or not active")

    # Get client metadata
    ip = request.client.host
    ua = request.headers.get("user-agent", "")
    device, browser, os_name = parse_user_agent(ua)
    location = await get_location(ip)

    submission = SurveySubmission(
        survey_id=survey_id,
        ip_address=ip,
        device=device,
        browser=browser,
        os=os_name,
        location=location,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return {"submission_id": submission.id}


@router.post("/submissions/{submission_id}/answers")
def save_answer(
    submission_id: int,
    question_id: int = Form(...),
    answer: str = Form(...),
    face_detected: bool = Form(...),
    face_score: float = Form(...),
    face_image: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    submission = db.query(SurveySubmission).filter(SurveySubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Save face image if provided
    face_image_path = None
    if face_image:
        img_dir = f"media/images/{submission_id}"
        os.makedirs(img_dir, exist_ok=True)
        img_path = f"{img_dir}/q{question_id}_face.png"
        with open(img_path, "wb") as f:
            shutil.copyfileobj(face_image.file, f)
        face_image_path = img_path

        # Save to MediaFile table
        mf = MediaFile(submission_id=submission_id, type="image", path=img_path)
        db.add(mf)

    ans = SurveyAnswer(
        submission_id=submission_id,
        question_id=question_id,
        answer=answer,
        face_detected=face_detected,
        face_score=face_score,
        face_image_path=face_image_path
    )
    db.add(ans)
    db.commit()
    return {"message": "Answer saved"}


@router.post("/submissions/{submission_id}/media")
def upload_media(
    submission_id: int,
    video: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    submission = db.query(SurveySubmission).filter(SurveySubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    vid_dir = f"media/videos/{submission_id}"
    os.makedirs(vid_dir, exist_ok=True)
    vid_path = f"{vid_dir}/full_session.webm"
    with open(vid_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    mf = MediaFile(submission_id=submission_id, type="video", path=vid_path)
    db.add(mf)
    db.commit()
    return {"message": "Video uploaded", "path": vid_path}


@router.post("/submissions/{submission_id}/complete")
def complete_submission(submission_id: int, data: CompleteSubmission, db: Session = Depends(get_db)):
    submission = db.query(SurveySubmission).filter(SurveySubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission.completed_at = datetime.now(timezone.utc)
    submission.overall_score = data.overall_score
    db.commit()
    return {"message": "Submission completed"}


@router.get("/submissions/{submission_id}/export")
def export_submission(submission_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse

    submission = db.query(SurveySubmission).filter(SurveySubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    answers = db.query(SurveyAnswer).filter(SurveyAnswer.submission_id == submission_id).all()

    # Build metadata.json
    responses = []
    for ans in sorted(answers, key=lambda a: a.question_id):
        q = db.query(SurveyQuestion).filter(SurveyQuestion.id == ans.question_id).first()
        responses.append({
            "question": q.question_text if q else "",
            "answer": ans.answer,
            "face_detected": ans.face_detected,
            "score": ans.face_score,
            "face_image": ans.face_image_path or ""
        })

    metadata = {
        "submission_id": str(submission.id),
        "survey_id": str(submission.survey_id),
        "started_at": submission.started_at.isoformat() if submission.started_at else None,
        "completed_at": submission.completed_at.isoformat() if submission.completed_at else None,
        "ip_address": submission.ip_address,
        "device": submission.device,
        "browser": submission.browser,
        "os": submission.os,
        "location": submission.location,
        "responses": responses,
        "overall_score": submission.overall_score
    }

    # Create zip
    zip_path = f"/tmp/export_{submission_id}.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("metadata.json", json.dumps(metadata, indent=2))

        # Add video
        video_file = db.query(MediaFile).filter(
            MediaFile.submission_id == submission_id,
            MediaFile.type == "video"
        ).first()
        if video_file and os.path.exists(video_file.path):
            zf.write(video_file.path, "videos/full_session.webm")

        # Add face images
        for i, ans in enumerate(sorted(answers, key=lambda a: a.question_id), 1):
            if ans.face_image_path and os.path.exists(ans.face_image_path):
                zf.write(ans.face_image_path, f"images/q{i}_face.png")

    return FileResponse(zip_path, media_type="application/zip", filename=f"submission_{submission_id}.zip")
