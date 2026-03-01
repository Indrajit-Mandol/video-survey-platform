from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.models import Survey, SurveyQuestion
from app.schemas.schemas import SurveyCreate, QuestionCreate, SurveyOut

router = APIRouter()


@router.post("/surveys", response_model=SurveyOut)
def create_survey(data: SurveyCreate, db: Session = Depends(get_db)):
    survey = Survey(title=data.title)
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return survey


@router.post("/surveys/{survey_id}/questions")
def add_question(survey_id: int, data: QuestionCreate, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    count = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).count()
    if count >= 5:
        raise HTTPException(status_code=400, detail="Survey already has 5 questions")

    question = SurveyQuestion(
        survey_id=survey_id,
        question_text=data.question_text,
        order=data.order
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.get("/surveys/{survey_id}")
def get_survey(survey_id: int, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    # Explicitly query questions — never rely on lazy loading
    questions = (
        db.query(SurveyQuestion)
        .filter(SurveyQuestion.survey_id == survey_id)
        .order_by(SurveyQuestion.order)
        .all()
    )

    return {
        "id": survey.id,
        "title": survey.title,
        "is_active": survey.is_active,
        "created_at": survey.created_at,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "order": q.order,
            }
            for q in questions
        ],
    }


@router.post("/surveys/{survey_id}/publish")
def publish_survey(survey_id: int, db: Session = Depends(get_db)):
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    questions = db.query(SurveyQuestion).filter(SurveyQuestion.survey_id == survey_id).count()
    if questions < 5:
        raise HTTPException(status_code=400, detail="Survey needs exactly 5 questions to publish")

    survey.is_active = True
    db.commit()
    return {"message": "Survey published", "survey_id": survey_id}