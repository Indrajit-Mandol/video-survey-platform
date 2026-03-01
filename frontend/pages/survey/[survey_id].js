import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useFaceDetection } from "../../components/useFaceDetection";

const API = process.env.NEXT_PUBLIC_API_URL;

// Steps: 0 = intro/permission, 1-5 = questions, 6 = done
export default function SurveyPage() {
  const router = useRouter();
  const { survey_id } = router.query;

  const [survey, setSurvey] = useState(null);
  const [step, setStep] = useState(0); // 0=intro, 1-5=question, 6=done
  const [submissionId, setSubmissionId] = useState(null);
  const [answers, setAnswers] = useState([]); // saved answers
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const { faceCount, faceScore, modelsLoading, captureSnapshot } = useFaceDetection(
    videoRef,
    canvasRef,
    step >= 1 && step <= 5
  );

  // Load survey — normalize questions to always be a sorted array
  useEffect(() => {
    if (!survey_id) return;
    fetch(`${API}/api/surveys/${survey_id}`)
      .then((r) => r.json())
      .then((data) => {
        console.log("Survey data from API:", JSON.stringify(data)); // debug
        // Ensure questions is always an array, sorted by order
        const normalized = {
          ...data,
          questions: Array.isArray(data.questions)
            ? [...data.questions].sort((a, b) => Number(a.order) - Number(b.order))
            : [],
        };
        setSurvey(normalized);
      })
      .catch(() => setError("Survey not found."));
  }, [survey_id]);

  // Start camera + submission when moving to step 1
  async function startSurvey() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;

      // Attach stream to video element
      const video = videoRef.current;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      // Pick a supported mimeType (webm works on Chrome/Firefox, fallback to default)
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      const recorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      // Start submission on backend (captures IP, UA, location)
      const res = await fetch(`${API}/api/surveys/${survey_id}/start`, { method: "POST" });
      const data = await res.json();
      setSubmissionId(data.submission_id);

      setStep(1);
    } catch (e) {
      console.error("Camera error:", e);
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setError("Camera permission denied. Please click 'Allow' when the browser asks for camera access.");
      } else if (e.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError(`Camera error: ${e.message}`);
      }
    }
  }

  // Called when user clicks Yes or No
  async function handleAnswer(answer) {
    setLoading(true);
    setError("");

    // Validate face
    if (faceCount === 0) {
      setError("No face detected. Please position your face in the camera.");
      setLoading(false);
      return;
    }
    if (faceCount > 1) {
      setError("Multiple faces detected. Only one person should be visible.");
      setLoading(false);
      return;
    }

    // Use index-based lookup (step 1 = index 0) — more reliable than matching order field
    const currentQuestion = survey?.questions?.[step - 1];
    if (!currentQuestion) {
      setError(`Question ${step} not found. Questions loaded: ${survey?.questions?.length ?? 0}`);
      setLoading(false);
      return;
    }
    const snapshot = await captureSnapshot();

    // Build form data
    const form = new FormData();
    form.append("question_id", currentQuestion.id);
    form.append("answer", answer);
    form.append("face_detected", "true");
    form.append("face_score", faceScore);
    if (snapshot) form.append("face_image", snapshot, `q${step}_face.png`);

    await fetch(`${API}/api/submissions/${submissionId}/answers`, {
      method: "POST",
      body: form,
    });

    setAnswers((prev) => [...prev, { question: currentQuestion.question_text, answer, faceScore }]);

    if (step === 5) {
      await finishSurvey();
    } else {
      setStep((s) => s + 1);
    }

    setLoading(false);
  }

  async function finishSurvey() {
    // Stop recording
    mediaRecorderRef.current?.stop();

    await new Promise((resolve) => setTimeout(resolve, 500)); // wait for data

    // Upload full video
    const videoBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
    const videoForm = new FormData();
    videoForm.append("video", videoBlob, "full_session.webm");
    await fetch(`${API}/api/submissions/${submissionId}/media`, {
      method: "POST",
      body: videoForm,
    });

    // Calculate overall score
    const allScores = answers.map((a) => a.faceScore);
    const overall = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

    await fetch(`${API}/api/submissions/${submissionId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overall_score: overall }),
    });

    // Stop camera
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setStep(6);
  }

  const currentQuestion = survey?.questions?.[step - 1];

  // Face status message
  let faceStatus = "";
  let faceColor = "#6b7280";
  if (step >= 1 && step <= 5) {
    if (faceCount === 0) { faceStatus = "⚠ No face detected"; faceColor = "#ef4444"; }
    else if (faceCount > 1) { faceStatus = "⚠ Multiple faces detected"; faceColor = "#f59e0b"; }
    else { faceStatus = `✓ Face detected (Score: ${faceScore})`;  faceColor = "#22c55e"; }
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", fontFamily: "sans-serif", padding: "20px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{survey?.title || "Loading..."}</h1>
        {step >= 1 && step <= 5 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ background: "#e5e7eb", borderRadius: 4, height: 8 }}>
              <div
                style={{ background: "#2563eb", borderRadius: 4, height: 8, width: `${(step / 5) * 100}%`, transition: "width 0.3s" }}
              />
            </div>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Question {step} of 5</p>
          </div>
        )}
      </div>

      {/* Step 0: Intro */}
      {step === 0 && (
        <div>
          <p>This survey has 5 Yes/No questions. Your camera will be used for face detection during the survey. No personal information is collected.</p>
          {error && (
            <p style={{ color: "#ef4444", background: "#fef2f2", padding: "10px 14px", borderRadius: 6, border: "1px solid #fca5a5" }}>
              {error}
            </p>
          )}
          <button onClick={startSurvey} style={btnStyle}>
            Allow Camera &amp; Start
          </button>
        </div>
      )}

      {/* Video element is ALWAYS in the DOM so videoRef is never null.
          Hidden on step 0, visible during questions. */}
      <div style={{ display: step >= 1 && step <= 5 ? "block" : "none" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <video
            ref={videoRef}
            width={480}
            height={360}
            muted
            playsInline
            style={{ borderRadius: 8, display: "block", background: "#000" }}
          />
          <canvas
            ref={canvasRef}
            width={480}
            height={360}
            style={{ position: "absolute", top: 0, left: 0 }}
          />
        </div>

        <p style={{ marginTop: 8, fontWeight: "bold", color: modelsLoading ? "#6b7280" : faceColor }}>
          {modelsLoading ? "⏳ Loading face detection model..." : faceStatus}
        </p>

        {step >= 1 && step <= 5 && (
          <div style={{ marginTop: 20, padding: 16, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
            <p style={{ fontSize: 18, marginTop: 0 }}>{currentQuestion?.question_text}</p>
            {modelsLoading && (
              <p style={{ color: "#6b7280", fontSize: 13 }}>Please wait, loading face detection...</p>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => handleAnswer("Yes")} disabled={loading || modelsLoading} style={{ ...btnStyle, background: "#22c55e", opacity: modelsLoading ? 0.5 : 1 }}>
                ✓ Yes
              </button>
              <button onClick={() => handleAnswer("No")} disabled={loading || modelsLoading} style={{ ...btnStyle, background: "#ef4444", opacity: modelsLoading ? 0.5 : 1 }}>
                ✗ No
              </button>
            </div>
          </div>
        )}

        {error && <p style={{ color: "#ef4444", marginTop: 12 }}>{error}</p>}
      </div>

      {/* Step 6: Done */}
      {step === 6 && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <h2>Survey Completed!</h2>
          <p>Thank you for completing the survey.</p>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Submission ID: {submissionId}</p>

          <div style={{ marginTop: 24, textAlign: "left" }}>
            <h3>Your Answers</h3>
            {answers.map((a, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #e5e7eb" }}>
                <strong>Q{i + 1}:</strong> {a.question} → <strong>{a.answer}</strong>{" "}
                <span style={{ color: "#6b7280", fontSize: 12 }}>(Face Score: {a.faceScore})</span>
              </div>
            ))}
          </div>

          <a
            href={`${API}/api/submissions/${submissionId}/export`}
            style={{ ...btnStyle, display: "inline-block", marginTop: 20, textDecoration: "none" }}
          >
            ⬇ Export ZIP
          </a>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding: "10px 24px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 15,
};