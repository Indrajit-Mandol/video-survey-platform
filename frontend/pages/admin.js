import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function AdminPage() {
  const [title, setTitle] = useState("");
  const [surveyId, setSurveyId] = useState(null);
  const [questions, setQuestions] = useState(["", "", "", "", ""]);
  const [message, setMessage] = useState("");

  async function createSurvey() {
    if (!title.trim()) return alert("Enter a title");
    const res = await fetch(`${API}/api/surveys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    setSurveyId(data.id);
    setMessage(`Survey created! ID: ${data.id}`);
  }

  async function addQuestions() {
    if (questions.some((q) => !q.trim())) return alert("Fill all 5 questions");
    for (let i = 0; i < 5; i++) {
      await fetch(`${API}/api/surveys/${surveyId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_text: questions[i], order: i + 1 }),
      });
    }
    setMessage("Questions added!");
  }

  async function publishSurvey() {
    const res = await fetch(`${API}/api/surveys/${surveyId}/publish`, { method: "POST" });
    const data = await res.json();
    setMessage(`Published! Share: /survey/${surveyId}`);
  }

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "sans-serif", padding: "0 20px" }}>
      <h1>Admin — Create Survey</h1>

      {!surveyId ? (
        <div>
          <label>Survey Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder="e.g. Camera Test Survey"
          />
          <button onClick={createSurvey} style={btnStyle}>Create Survey</button>
        </div>
      ) : (
        <div>
          <h2>Add 5 Questions</h2>
          {questions.map((q, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <label>Q{i + 1}</label>
              <input
                value={q}
                onChange={(e) => {
                  const updated = [...questions];
                  updated[i] = e.target.value;
                  setQuestions(updated);
                }}
                style={inputStyle}
                placeholder={`Question ${i + 1}`}
              />
            </div>
          ))}
          <button onClick={addQuestions} style={btnStyle}>Save Questions</button>
          <button onClick={publishSurvey} style={{ ...btnStyle, background: "#22c55e", marginLeft: 10 }}>
            Publish Survey
          </button>
        </div>
      )}

      {message && (
        <div style={{ marginTop: 20, padding: 12, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 6 }}>
          {message}
          {surveyId && message.includes("Published") && (
            <div style={{ marginTop: 8 }}>
              <a href={`/survey/${surveyId}`} style={{ color: "#2563eb" }}>
                → Go to Survey /survey/{surveyId}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  display: "block",
  width: "100%",
  padding: "8px 12px",
  marginTop: 4,
  marginBottom: 8,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
};

const btnStyle = {
  padding: "10px 20px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
