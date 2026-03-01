export default function Home() {
  return (
    <div style={{ maxWidth: 600, margin: "80px auto", fontFamily: "sans-serif", padding: "0 20px" }}>
      <h1>Video Survey Platform</h1>
      <p>A privacy-first survey platform with face detection.</p>
      <ul style={{ lineHeight: 2 }}>
        <li><a href="/admin">→ Admin: Create a Survey</a></li>
        <li><code>/survey/[id]</code> — Share this URL with respondents</li>
      </ul>
    </div>
  );
}
