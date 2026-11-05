import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "@/lib/supabase";


async function verifyTeacher(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const ssrClient = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });

  let user = null;
  const { data } = await ssrClient.auth.getUser();
  user = data?.user || null;

  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const { data: tokenData } = await supabaseServer.auth.getUser(token);
      user = tokenData?.user || null;
    }
  }

  if (!user) return null;

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "teacher" && user.user_metadata?.role !== "teacher") {
    return null;
  }

  return user;
}

export async function GET(req: NextRequest) {
  try {
    const teacherUser = await verifyTeacher(req);
    if (!teacherUser) {
      return NextResponse.json({ error: "Forbidden: Teacher access required" }, { status: 403 });
    }

    const { searchParams } = req.nextUrl;
    const subjectId = searchParams.get("subjectId") || null;
    const days = parseInt(searchParams.get("days") || "14", 10);

    const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch all subjects for the filter dropdown
    const { data: allSubjects } = await supabaseServer
      .from("subjects")
      .select("id, name")
      .order("name", { ascending: true });

    // 2. Fetch all student profiles
    const { data: allStudents } = await supabaseServer
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name", { ascending: true });

    // 3. Fetch student group memberships
    const { data: groupMembers } = await supabaseServer
      .from("group_members")
      .select("student_id, group_id, groups:group_id (name, subject_id)");

    const studentGroupsMap = new Map<string, string[]>();
    for (const gm of (groupMembers as any[]) || []) {
      const sId = gm.student_id;
      const gName = gm.groups?.name;
      if (sId && gName) {
        const list = studentGroupsMap.get(sId) || [];
        if (!list.includes(gName)) list.push(gName);
        studentGroupsMap.set(sId, list);
      }
    }

    // 4. Fetch all chapters and books for chapter metadata joining
    const { data: chaptersData } = await supabaseServer
      .from("chapters")
      .select("id, number, title, book_id, books:book_id (id, title, part, subject_id, subjects:subject_id (name))");

    const chapterMap = new Map<string, {
      chapterNumber: number;
      chapterTitle: string;
      bookTitle: string;
      bookPart: string | null;
      subjectId: string;
      subjectName: string;
    }>();

    for (const c of (chaptersData as any[]) || []) {
      chapterMap.set(c.id, {
        chapterNumber: c.number,
        chapterTitle: c.title,
        bookTitle: c.books?.title || "NCERT",
        bookPart: c.books?.part || null,
        subjectId: c.books?.subject_id || "",
        subjectName: c.books?.subjects?.name || "General",
      });
    }

    // 5. Query query_logs within range (filtered by subject if selected)
    // Exclude rows where user_id is null (test/eval/anon queries)
    let logsQuery = supabaseServer
      .from("query_logs")
      .select("id, subject_id, query, chapter_ids, answered, top_similarity, created_at, user_id")
      .not("user_id", "is", null)
      .gte("created_at", rangeStart)
      .order("created_at", { ascending: false });

    if (subjectId && subjectId !== "all") {
      logsQuery = logsQuery.eq("subject_id", subjectId);
    }

    const { data: logs, error: logsErr } = await logsQuery;
    if (logsErr) throw logsErr;

    // Filter strictly to student accounts (excludes teacher test chats and eval/test script users)
    const studentIdSet = new Set((allStudents || []).map((s) => s.id));
    const logRows = (logs || []).filter((l) => l.user_id && studentIdSet.has(l.user_id));

    // --- AGGREGATE 1: Stat Cards ---
    const totalStudents = allStudents?.length || 0;
    const totalQuestions = logRows.length;
    const answeredCount = logRows.filter((l) => l.answered).length;
    const answeredPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 1000) / 10 : 0;
    const notCoveredCount = totalQuestions - answeredCount;

    // --- AGGREGATE 2: Questions Per Day (Line Chart) ---
    // Generate all dates in the requested range
    const dailyMap = new Map<string, { total: number; answered: number; refused: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateKey = d.toISOString().split("T")[0];
      dailyMap.set(dateKey, { total: 0, answered: 0, refused: 0 });
    }

    for (const log of logRows) {
      const dateKey = log.created_at.split("T")[0];
      const entry = dailyMap.get(dateKey) || { total: 0, answered: 0, refused: 0 };
      entry.total++;
      if (log.answered) entry.answered++;
      else entry.refused++;
      dailyMap.set(dateKey, entry);
    }

    const questionsPerDay = Array.from(dailyMap.entries()).map(([date, counts]) => ({
      date: date.slice(5), // "MM-DD"
      fullDate: date,
      questions: counts.total,
      answered: counts.answered,
      refused: counts.refused,
    }));

    // --- AGGREGATE 3: Questions Per Subject (Bar Chart) ---
    const subjectNamesMap = new Map<string, string>();
    (allSubjects || []).forEach((s) => subjectNamesMap.set(s.id, s.name.charAt(0).toUpperCase() + s.name.slice(1)));

    const subjectCounts = new Map<string, number>();
    (allSubjects || []).forEach((s) => subjectCounts.set(s.name.charAt(0).toUpperCase() + s.name.slice(1), 0));

    for (const log of logRows) {
      if (log.subject_id && subjectNamesMap.has(log.subject_id)) {
        const sName = subjectNamesMap.get(log.subject_id)!;
        subjectCounts.set(sName, (subjectCounts.get(sName) || 0) + 1);
      } else if (log.chapter_ids && log.chapter_ids.length > 0) {
        const firstCh = chapterMap.get(log.chapter_ids[0]);
        if (firstCh) {
          const sName = firstCh.subjectName.charAt(0).toUpperCase() + firstCh.subjectName.slice(1);
          subjectCounts.set(sName, (subjectCounts.get(sName) || 0) + 1);
        }
      }
    }

    const questionsPerSubject = Array.from(subjectCounts.entries()).map(([subject, count]) => ({
      subject,
      count,
    }));

    // --- AGGREGATE 4: Most Asked Chapters ---
    interface ChapterAggEntry {
      chapterId: string;
      count: number;
      questions: Array<{ query: string; answered: boolean; createdAt: string; studentName?: string }>;
    }
    const chapterQuestionsMap = new Map<string, ChapterAggEntry>();

    const studentNamesMap = new Map<string, string>();
    (allStudents || []).forEach((s) => studentNamesMap.set(s.id, s.full_name || "Student"));

    for (const log of logRows) {
      if (log.chapter_ids && log.chapter_ids.length > 0) {
        for (const chId of log.chapter_ids) {
          const entry: ChapterAggEntry = chapterQuestionsMap.get(chId) || { chapterId: chId, count: 0, questions: [] };
          entry.count++;
          entry.questions.push({
            query: log.query,
            answered: log.answered,
            createdAt: log.created_at,
            studentName: log.user_id ? studentNamesMap.get(log.user_id) : undefined,
          });
          chapterQuestionsMap.set(chId, entry);
        }
      }
    }

    const sortedChapters = Array.from(chapterQuestionsMap.values())
      .map((entry) => {
        const meta = chapterMap.get(entry.chapterId) || {
          chapterNumber: 0,
          chapterTitle: "General Chapter",
          bookTitle: "NCERT",
          bookPart: null,
          subjectId: "",
          subjectName: "General",
        };
        return {
          chapterId: entry.chapterId,
          chapterNumber: meta.chapterNumber,
          chapterTitle: meta.chapterTitle,
          bookTitle: meta.bookTitle,
          bookPart: meta.bookPart,
          subjectName: meta.subjectName.charAt(0).toUpperCase() + meta.subjectName.slice(1),
          count: entry.count,
          questions: entry.questions.slice(0, 20),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const maxChapterCount = sortedChapters.length > 0 ? sortedChapters[0].count : 1;
    const mostAskedChapters = sortedChapters.map((ch) => ({
      ...ch,
      percentage: Math.round((ch.count / maxChapterCount) * 100),
    }));

    // --- AGGREGATE 5: Not Covered By Textbooks ---
    const refusedQueriesMap = new Map<string, { count: number; lastAskedAt: string }>();
    for (const log of logRows) {
      if (!log.answered) {
        const qKey = log.query.trim().toLowerCase();
        const existing = refusedQueriesMap.get(qKey);
        if (existing) {
          existing.count++;
          if (new Date(log.created_at) > new Date(existing.lastAskedAt)) {
            existing.lastAskedAt = log.created_at;
          }
        } else {
          refusedQueriesMap.set(qKey, { count: 1, lastAskedAt: log.created_at });
        }
      }
    }

    const notCoveredQuestions = Array.from(refusedQueriesMap.entries())
      .map(([query, data]) => ({
        query: query.charAt(0).toUpperCase() + query.slice(1),
        count: data.count,
        lastAskedAt: data.lastAskedAt || new Date().toISOString(),
        createdAt: data.lastAskedAt || new Date().toISOString(),
      }))
      .sort((a, b) => b.count - a.count || new Date(b.lastAskedAt).getTime() - new Date(a.lastAskedAt).getTime())
      .slice(0, 15);

    // --- AGGREGATE 6: Students Activity Table ---
    const studentStats = (allStudents || []).map((student) => {
      const studentLogs = logRows.filter((l) => l.user_id === student.id);
      const questionCount = studentLogs.length;

      let lastActive = "Never";
      if (studentLogs.length > 0) {
        lastActive = studentLogs[0].created_at; // already sorted by created_at DESC
      }

      // Top 3 chapters for this student
      const chCountMap = new Map<string, number>();
      for (const sl of studentLogs) {
        for (const chId of sl.chapter_ids || []) {
          chCountMap.set(chId, (chCountMap.get(chId) || 0) + 1);
        }
      }
      const top3Chapters = Array.from(chCountMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([chId]) => chapterMap.get(chId)?.chapterTitle || "Chapter");

      // Recent questions for drill-down (privacy safe: only logged query text and timestamp)
      const recentQuestions = studentLogs.slice(0, 15).map((sl) => {
        const citedCh = sl.chapter_ids?.[0] ? chapterMap.get(sl.chapter_ids[0])?.chapterTitle : null;
        return {
          id: sl.id,
          query: sl.query,
          answered: sl.answered,
          chapterTitle: citedCh || "Out of syllabus",
          createdAt: sl.created_at,
          topSimilarity: sl.top_similarity,
        };
      });

      return {
        id: student.id,
        name: student.full_name || "Student",
        groups: studentGroupsMap.get(student.id) || [],
        questionCount,
        lastActive,
        topChapters: top3Chapters,
        recentQuestions,
      };
    }).sort((a, b) => b.questionCount - a.questionCount);

    return NextResponse.json({
      statCards: {
        totalStudents,
        totalQuestions,
        answeredCount,
        answeredPercent,
        notCoveredCount,
      },
      questionsPerDay,
      questionsPerSubject,
      mostAskedChapters,
      notCoveredQuestions,
      students: studentStats,
      allSubjects: (allSubjects || []).map((s) => ({
        id: s.id,
        name: s.name.charAt(0).toUpperCase() + s.name.slice(1),
      })),
    });
  } catch (err: any) {
    console.error("Teacher dashboard API error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
