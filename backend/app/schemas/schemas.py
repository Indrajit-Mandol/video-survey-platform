from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Survey schemas
class QuestionCreate(BaseModel):
    question_text: str
    order: int

class SurveyCreate(BaseModel):
    title: str

class QuestionOut(BaseModel):
    id: int
    question_text: str
    order: int

    class Config:
        from_attributes = True

class SurveyOut(BaseModel):
    id: int
    title: str
    is_active: bool
    created_at: datetime
    questions: List[QuestionOut] = []

    class Config:
        from_attributes = True


# Submission schemas
class StartSubmissionOut(BaseModel):
    submission_id: int

class AnswerSubmit(BaseModel):
    question_id: int
    answer: str  # "Yes" or "No"
    face_detected: bool
    face_score: float

class CompleteSubmission(BaseModel):
    overall_score: float
