async function checkDashboard() {
  const res = await fetch("https://dumroo-rag.vercel.app/api/teacher/dashboard", {
    headers: { "Cache-Control": "no-cache" }
  });
  console.log("Status /api/teacher/dashboard:", res.status);
  const data = await res.json();
  console.log("Dashboard response keys:", Object.keys(data));
  if (data.syllabusGaps) {
    console.log("Syllabus gaps sample:", data.syllabusGaps.slice(0, 2));
  }
}

checkDashboard().catch(console.error);
