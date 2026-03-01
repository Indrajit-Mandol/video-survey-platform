#!/bin/bash
# Downloads face-api.js TinyFaceDetector model files into frontend/public/models/
# Run this once before starting the app

mkdir -p frontend/public/models

BASE="https://raw.githubusercontent.com/vladmandic/face-api/master/model"

echo "Downloading TinyFaceDetector models..."
curl -L "$BASE/tiny_face_detector_model-weights_manifest.json" -o frontend/public/models/tiny_face_detector_model-weights_manifest.json
curl -L "$BASE/tiny_face_detector_model-shard1" -o frontend/public/models/tiny_face_detector_model-shard1

echo "Done! Models saved to frontend/public/models/"
