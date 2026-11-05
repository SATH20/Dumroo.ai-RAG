async function checkApi() {
  const res = await fetch("https://dumroo-rag.vercel.app/api/subjects", {
    headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" },
  });
  console.log("Status /api/subjects:", res.status);
  console.log("Headers:", Object.fromEntries(res.headers.entries()));
}

checkApi().catch(console.error);
