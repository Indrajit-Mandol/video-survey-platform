from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
from app.routes import surveys, submissions
import os

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Video Survey Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded media files
os.makedirs("media/videos", exist_ok=True)
os.makedirs("media/images", exist_ok=True)
app.mount("/media", StaticFiles(directory="media"), name="media")

app.include_router(surveys.router, prefix="/api")
app.include_router(submissions.router, prefix="/api")

@app.get("/")
def root():
    return {"message": "Video Survey Platform API"}
