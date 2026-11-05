"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  LogOut,
  LayoutDashboard,
  MessageSquare,
  Users,
  Search,
  Sparkles,
  Send,
  Loader2,
  Globe,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  X,
  TrendingUp,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Maximize2,
  Layers,
  UserPlus,
  Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface TeacherSessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface StatCardsData {
  totalStudents: number;
  totalQuestions: number;
  answeredCount: number;
  answeredPercent: number;
  notCoveredCount: number;
}

interface MostAskedChapter {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  bookTitle: string;
  bookPart: string | null;
  subjectName: string;
  count: number;
  percentage: number;
  questions: Array<{
    query: string;
    answered: boolean;
    createdAt: string;
    studentName?: string;
  }>;
}

interface StudentStat {
  id: string;
  name: string;
  groups: string[];
  questionCount: number;
  lastActive: string;
  topChapters: string[];
  recentQuestions: Array<{
    id: string;
    query: string;
    answered: boolean;
    chapterTitle: string;
    createdAt: string;
    topSimilarity?: number;
  }>;
}

interface TeacherGroup {
  id: string;
  name: string;
  subjectId: string;
  subjectName: string;
  members: Array<{ id: string; name: string }>;
  memberCount: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  userQuestion?: string;
  sources?: any[];
  images?: any[];
  pageImages?: any[];
  webSources?: Array<{ title: string; url: string; content: string }>;
  refusal?: boolean;
  cutoff?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
}

export default function TeacherPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<TeacherSessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "ask" | "groups">("dashboard");

  // Dashboard Filters State
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");
  const [selectedDays, setSelectedDays] = useState<number>(14);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Dashboard Data State
  const [statCards, setStatCards] = useState<StatCardsData>({
    totalStudents: 0,
    totalQuestions: 0,
    answeredCount: 0,
    answeredPercent: 0,
    notCoveredCount: 0,
  });
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [questionsPerDay, setQuestionsPerDay] = useState<any[]>([]);
  const [questionsPerSubject, setQuestionsPerSubject] = useState<any[]>([]);
  const [mostAskedChapters, setMostAskedChapters] = useState<MostAskedChapter[]>([]);
  const [notCoveredQuestions, setNotCoveredQuestions] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentStat[]>([]);

  // Modals / Drill-downs
  const [selectedChapterDetail, setSelectedChapterDetail] = useState<MostAskedChapter | null>(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentStat | null>(null);

  // Groups Management State
  const [groups, setGroups] = useState<TeacherGroup[]>([]);
  const [allStudentsList, setAllStudentsList] = useState<Array<{ id: string; name: string }>>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [addingToGroupId, setAddingToGroupId] = useState<string | null>(null);

  // Create Student Form State
  const [showCreateStudentModal, setShowCreateStudentModal] = useState(false);
  const [createStudentName, setCreateStudentName] = useState("");
  const [createStudentEmail, setCreateStudentEmail] = useState("");
  const [createStudentPassword, setCreateStudentPassword] = useState("");
  const [createStudentGroupIds, setCreateStudentGroupIds] = useState<string[]>([]);
  const [createStudentLoading, setCreateStudentLoading] = useState(false);
  const [createStudentError, setCreateStudentError] = useState<string | null>(null);
  const [createStudentSuccess, setCreateStudentSuccess] = useState<string | null>(null);

  // Teacher Ask (Chat) State
  const [teacherChats, setTeacherChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [hasTavily, setHasTavily] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Authenticate Teacher Session
  useEffect(() => {
    async function initSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (data.user?.role !== "teacher") {
          router.push("/student");
          return;
        }
        setCurrentUser(data.user);
        const tavilyAvailable = !!data.hasTavily;
        setHasTavily(tavilyAvailable);
        if (!tavilyAvailable) {
          setWebSearchEnabled(false);
        }
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    }
    initSession();
  }, [router]);

  // 2. Load Dashboard Data
  useEffect(() => {
    if (!currentUser) return;

    async function loadDashboard() {
      setDashboardLoading(true);
      try {
        const url = `/api/teacher/dashboard?subjectId=${selectedSubjectId}&days=${selectedDays}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setStatCards(data.statCards || {
            totalStudents: 0,
            totalQuestions: 0,
            answeredCount: 0,
            answeredPercent: 0,
            notCoveredCount: 0,
          });
          setQuestionsPerDay(data.questionsPerDay || []);
          setQuestionsPerSubject(data.questionsPerSubject || []);
          setMostAskedChapters(data.mostAskedChapters || []);
          setNotCoveredQuestions(data.notCoveredQuestions || []);
          setStudents(data.students || []);
          setAllSubjects(data.allSubjects || []);
        }
      } catch (err) {
        console.error("Failed to load dashboard metrics:", err);
      } finally {
        setDashboardLoading(false);
      }
    }

    if (activeTab === "dashboard") {
      loadDashboard();
    }
  }, [currentUser, selectedSubjectId, selectedDays, activeTab]);

  // 3. Load Groups Management Data
  const loadGroups = async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/teacher/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
        setAllStudentsList(data.allStudents || []);
      }
    } catch (err) {
      console.error("Failed to load groups:", err);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser || activeTab !== "groups") return;
    loadGroups();
  }, [currentUser, activeTab]);

  // 4. Load Teacher Chats
  useEffect(() => {
    if (!currentUser || activeTab !== "ask") return;

    async function loadChats() {
      try {
        const res = await fetch("/api/chats?mode=teacher");
        if (res.ok) {
          const data = await res.json();
          const list = data.chats || [];
          setTeacherChats(list);
          if (list.length > 0 && !activeChatId) {
            setActiveChatId(list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load teacher chats:", err);
      }
    }
    loadChats();
  }, [currentUser, activeTab]);

  // 5. Load Active Chat Messages
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      try {
        const res = await fetch(`/api/chats/${activeChatId}/messages`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load chat messages:", err);
      }
    }
    loadMessages();
  }, [activeChatId]);

  useEffect(() => {
    if (activeTab === "ask") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  // Group Member Handlers
  const handleAddMember = async (groupId: string, studentId: string) => {
    try {
      const res = await fetch("/api/teacher/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, studentId }),
      });
      if (res.ok) {
        // Refresh groups
        const gRes = await fetch("/api/teacher/groups");
        if (gRes.ok) {
          const data = await gRes.json();
          setGroups(data.groups || []);
        }
      }
    } catch (err) {
      console.error("Failed to add member:", err);
    } finally {
      setAddingToGroupId(null);
    }
  };

  const handleRemoveMember = async (groupId: string, studentId: string) => {
    try {
      const res = await fetch("/api/teacher/groups/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, studentId }),
      });
      if (res.ok) {
        setGroups((prev) =>
          prev.map((g) =>
            g.id === groupId
              ? {
                  ...g,
                  members: g.members.filter((m) => m.id !== studentId),
                  memberCount: Math.max(0, g.memberCount - 1),
                }
              : g
          )
        );
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateStudentError(null);
    setCreateStudentSuccess(null);

    if (!createStudentName.trim()) {
      setCreateStudentError("Student full name is required.");
      return;
    }
    if (!createStudentEmail.trim() || !createStudentEmail.includes("@")) {
      setCreateStudentError("A valid email address is required.");
      return;
    }
    if (createStudentPassword.length < 6) {
      setCreateStudentError("Password must be at least 6 characters.");
      return;
    }

    setCreateStudentLoading(true);
    try {
      const res = await fetch("/api/teacher/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: createStudentName.trim(),
          email: createStudentEmail.trim(),
          password: createStudentPassword,
          groupIds: createStudentGroupIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create student account.");
      }

      setCreateStudentSuccess(`Student "${data.student.name}" created successfully!`);
      setCreateStudentName("");
      setCreateStudentEmail("");
      setCreateStudentPassword("");
      setCreateStudentGroupIds([]);
      await loadGroups();
      setTimeout(() => {
        setShowCreateStudentModal(false);
        setCreateStudentSuccess(null);
      }, 1500);
    } catch (err: any) {
      setCreateStudentError(err.message || "Failed to create student account.");
    } finally {
      setCreateStudentLoading(false);
    }
  };

  // Teacher Chat Handlers
  const handleCreateTeacherChat = async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Teacher Chat", mode: "teacher" }),
      });
      if (res.ok) {
        const data = await res.json();
        setTeacherChats((prev) => [data.chat, ...prev]);
        setActiveChatId(data.chat.id);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  const handleSendChat = async (e?: React.FormEvent, customQuestion?: string) => {
    if (e) e.preventDefault();
    const query = customQuestion || chatInput.trim();
    if (!query || isStreaming) return;

    setChatInput("");
    setIsStreaming(true);

    const userMsgId = `usr-${Date.now()}`;
    const assistantMsgId = `ast-${Date.now()}`;

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: userMsgId, role: "user", content: query },
      { id: assistantMsgId, role: "assistant", content: "", userQuestion: query, isStreaming: true },
    ];
    setMessages(newMessages);

    try {
      let chatId = activeChatId;
      if (!chatId) {
        const chatRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: query.slice(0, 30), mode: "teacher" }),
        });
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          chatId = chatData.chat.id;
          setActiveChatId(chatId);
          setTeacherChats((prev) => [chatData.chat, ...prev]);
        }
      }

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          chatId,
          webSearch: webSearchEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          let event = "message";
          let dataStr = "";

          for (const line of trimmed.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }

          if (!dataStr) continue;
          let data: any = {};
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (event === "meta") {
            const rawWeb: any[] = data.webSources || [];
            const seenUrls = new Set<string>();
            const uniqueWeb: any[] = [];
            for (const ws of rawWeb) {
              const u = (ws.url || "").trim().replace(/\/+$/, "");
              if (!u || seenUrls.has(u)) continue;
              seenUrls.add(u);
              uniqueWeb.push(ws);
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      sources: data.sources && data.sources.length > 0 ? data.sources : [],
                      images: data.images && data.images.length > 0 ? data.images : [],
                      pageImages: data.pageImages && data.pageImages.length > 0 ? data.pageImages : [],
                      webSources: uniqueWeb,
                    }
                  : m
              )
            );
          } else if (event === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: m.content + data.delta } : m
              )
            );
          } else if (event === "cutoff") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, cutoff: true } : m))
            );
          } else if (event === "refusal") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      refusal: true,
                      content: data.message,
                      sources: [],
                      images: [],
                      pageImages: [],
                      webSources: data.webSources || [],
                    }
                  : m
              )
            );
          } else if (event === "done") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
            );
          }
        }
      }
    } catch (err: any) {
      console.error("Ask query error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                isError: true,
                content: "The teacher assistant is busy right now, please try again.",
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="text-sm font-medium">Loading educator workspace...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Lightbox for Textbook Figures */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-2 shadow-2xl flex flex-col">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="Textbook figure enlarged"
              className="w-full h-auto max-h-[85vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 shadow-2xs z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-slate-900">
                  Dumroo<span className="text-blue-600">.ai</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Teacher Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-500">NCERT Class 11 Curriculum Oversight & Analytics</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center bg-slate-100 p-1 rounded-xl ml-6 gap-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab("ask")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "ask"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Ask (Teacher Chat)</span>
            </button>
            <button
              onClick={() => setActiveTab("groups")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "groups"
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Students & Groups</span>
            </button>
          </nav>
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-800">{currentUser?.fullName}</div>
            <div className="text-[11px] text-slate-500">{currentUser?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto">
        {/* ========================================================================= */}
        {/* TAB 1: TEACHER DASHBOARD */}
        {/* ========================================================================= */}
        {activeTab === "dashboard" && (
          <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Subject:</span>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">All Subjects ({allSubjects.length})</option>
                  {allSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Range Filters */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDays(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      selectedDays === d
                        ? "bg-white text-blue-700 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Last {d} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Enrolled Students</span>
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-black text-slate-900">{statCards.totalStudents}</div>
                <div className="text-[11px] text-slate-500 mt-1">Across 5 academic subject groups</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Questions Asked</span>
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-black text-slate-900">{statCards.totalQuestions}</div>
                <div className="text-[11px] text-slate-500 mt-1">In the last {selectedDays} days</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Textbook Answer Rate</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-emerald-600">{statCards.answeredPercent}%</div>
                <div className="text-[11px] text-slate-500 mt-1">{statCards.answeredCount} grounded answers</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Not Covered / Refused</span>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-amber-600">{statCards.notCoveredCount}</div>
                <div className="text-[11px] text-slate-500 mt-1">Syllabus gap or outside curriculum</div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Line Chart: Questions Per Day */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    Questions Activity Over Time
                  </h3>
                  <span className="text-[11px] text-slate-500">Daily Volume</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={questionsPerDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderRadius: "12px",
                          border: "none",
                          color: "#fff",
                          fontSize: "11px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="questions"
                        name="Total Queries"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: "#2563eb" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="answered"
                        name="Answered"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bar Chart: Questions Per Subject */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    Queries Breakdown by Subject
                  </h3>
                  <span className="text-[11px] text-slate-500">Subject Distribution</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={questionsPerSubject} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0f172a",
                          borderRadius: "12px",
                          border: "none",
                          color: "#fff",
                          fontSize: "11px",
                        }}
                      />
                      <Bar dataKey="count" name="Questions" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Row: Most Asked Chapters & Not Covered Questions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Most Asked Chapters (2 Cols) */}
              <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Most Asked NCERT Chapters
                    </h3>
                    <p className="text-[11px] text-slate-500">Click any chapter row to inspect logged queries</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    Top {mostAskedChapters.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto max-h-96">
                  {mostAskedChapters.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">No chapter queries logged yet.</div>
                  ) : (
                    mostAskedChapters.map((ch, idx) => (
                      <div
                        key={ch.chapterId || idx}
                        onClick={() => setSelectedChapterDetail(ch)}
                        className="p-3 rounded-xl border border-slate-100 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-slate-800 shrink-0">
                              {ch.subjectName}
                              {ch.bookPart ? ` (${ch.bookPart})` : ""}:
                            </span>
                            <span className="text-slate-600 truncate font-medium">
                              Ch {ch.chapterNumber} - {ch.chapterTitle}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 font-bold text-blue-700">
                            <span>{ch.count} queries</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                          </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(ch.percentage, 5)}%` }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Not Covered Questions (1 Col) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4 text-amber-600" />
                      Not Covered by Textbooks
                    </h3>
                    <p className="text-[11px] text-slate-500">Potential syllabus gaps & off-topic questions</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    {notCoveredQuestions.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-96">
                  {notCoveredQuestions.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-xs">No refused queries found.</div>
                  ) : (
                    notCoveredQuestions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-amber-50/50 border border-amber-100 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 line-clamp-2">{q.query}</div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            Last asked: {new Date(q.lastAskedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200/60 text-amber-900 text-[10px] font-bold shrink-0">
                          {q.count}x
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Students Table */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Student Study Activity
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Click any student to review their study questions. Private chats and memory profile are hidden.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {students.length} Students
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                      <th className="pb-3 px-3">Student Name</th>
                      <th className="pb-3 px-3">Subject Groups</th>
                      <th className="pb-3 px-3 text-center">Questions</th>
                      <th className="pb-3 px-3">Last Active</th>
                      <th className="pb-3 px-3">Top Requested Chapters</th>
                      <th className="pb-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((st) => (
                      <tr
                        key={st.id}
                        onClick={() => setSelectedStudentDetail(st)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-3.5 px-3 font-bold text-slate-900">{st.name}</td>
                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {st.groups.map((g, gIdx) => (
                              <span
                                key={gIdx}
                                className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-medium"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                          {st.questionCount}
                        </td>
                        <td className="py-3.5 px-3 text-slate-500">
                          {st.lastActive !== "Never" ? new Date(st.lastActive).toLocaleDateString() : "Never"}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600 max-w-xs truncate">
                          {st.topChapters.length > 0 ? st.topChapters.join(", ") : "—"}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button className="text-blue-600 font-semibold text-xs group-hover:underline flex items-center gap-1 ml-auto">
                            <span>View Queries</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ASK (TEACHER CHAT WITH TAVILY WEB SEARCH) */}
        {/* ========================================================================= */}
        {activeTab === "ask" && (
          <div className="flex h-full overflow-hidden bg-slate-50">
            {/* Teacher Chat Sidebar */}
            <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shrink-0">
              <div className="p-3 border-b border-slate-800">
                <button
                  onClick={handleCreateTeacherChat}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Teacher Chat</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {teacherChats.length === 0 ? (
                  <div className="text-slate-500 text-xs p-3 text-center">No teacher chats yet.</div>
                ) : (
                  teacherChats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveChatId(c.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-xs truncate transition-colors cursor-pointer flex items-center gap-2 ${
                        activeChatId === c.id
                          ? "bg-slate-800 text-white font-semibold"
                          : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                      <span className="truncate">{c.title || "Chat"}</span>
                    </button>
                  ))
                )}
              </div>
            </aside>

            {/* Chat Stream Area */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
              {/* Chat Sub-header */}
              <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {teacherChats.find((c) => c.id === activeChatId)?.title || "Educator AI Assistant"}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                    Unrestricted All-Subject Scope
                  </span>
                </div>

                {/* Tavily Web Search Toggle */}
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium flex items-center gap-1 ${
                      hasTavily ? "text-slate-600" : "text-slate-400"
                    }`}
                  >
                    <Globe className={`w-3.5 h-3.5 ${hasTavily ? "text-blue-600" : "text-slate-400"}`} />
                    Web Search (Tavily):
                  </span>
                  <button
                    disabled={!hasTavily}
                    onClick={() => hasTavily && setWebSearchEnabled(!webSearchEnabled)}
                    title={
                      hasTavily
                        ? "Toggle live web search"
                        : "Web search unavailable (TAVILY_API_KEY not configured)"
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      !hasTavily
                        ? "bg-slate-200 cursor-not-allowed opacity-60"
                        : webSearchEnabled
                        ? "bg-blue-600 cursor-pointer"
                        : "bg-slate-300 cursor-pointer"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        webSearchEnabled && hasTavily ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                  {!hasTavily && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                      API key unset (books-only)
                    </span>
                  )}
                </div>
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4 shadow-2xs">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">Teacher Curriculum & Lesson AI Assistant</h3>
                    <p className="text-xs text-slate-500 mt-1 mb-4">
                      Search across all Class 11 textbooks simultaneously, prepare lesson outlines, compare formulas, or enable live Web Search via Tavily.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <button
                        onClick={() => handleSendChat(undefined, "Compare projectile motion formulas in Physics with real world satellite orbits")}
                        className="text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-blue-50/50 hover:border-blue-300 text-slate-700 text-left transition-all cursor-pointer"
                      >
                        Compare projectile motion with satellite orbits
                      </button>
                      <button
                        onClick={() => handleSendChat(undefined, "Explain modern spectroscopic methods for determining molecular geometry")}
                        className="text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-blue-50/50 hover:border-blue-300 text-slate-700 text-left transition-all cursor-pointer"
                      >
                        Modern spectroscopic methods for molecular geometry
                      </button>
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex gap-3 max-w-4xl mx-auto ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {m.role === "assistant" && (
                        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                          <Sparkles className="w-4 h-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-2xl rounded-2xl p-4 sm:p-5 shadow-2xs ${
                          m.role === "user"
                            ? "bg-blue-600 text-white ml-12"
                            : "bg-white text-slate-800 border border-slate-200"
                        }`}
                      >
                        {m.role === "assistant" ? (
                          <div>
                            {m.refusal && (
                              <div className="p-3 mb-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                  <div className="font-semibold">Textbook Coverage Notice</div>
                                  <div className="whitespace-pre-line mt-1">{m.content}</div>
                                </div>
                              </div>
                            )}

                            {!m.refusal && (
                              <div className="prose prose-slate prose-sm max-w-none text-slate-800 leading-relaxed font-sans">
                                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {m.content}
                                </ReactMarkdown>
                              </div>
                            )}

                            {/* Truncation / Cutoff Banner */}
                            {m.cutoff && (
                              <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-800">
                                <span>Answer was cut off, regenerate</span>
                                <button
                                  type="button"
                                  onClick={() => handleSendChat(undefined, m.userQuestion || "")}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium cursor-pointer"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Regenerate</span>
                                </button>
                              </div>
                            )}

                            {/* Web Sources Strip (Tavily) */}
                            {m.webSources && m.webSources.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-100">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                                  Live Web Sources via Tavily ({m.webSources.length})
                                </div>
                                <div className="space-y-2">
                                  {m.webSources.map((ws, i) => (
                                    <a
                                      key={i}
                                      href={ws.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-blue-50/40 hover:border-blue-300 transition-all text-xs group"
                                    >
                                      <div className="font-semibold text-blue-700 flex items-center gap-1 group-hover:underline">
                                        <span>{ws.title}</span>
                                        <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-blue-600" />
                                      </div>
                                      <div className="text-slate-500 line-clamp-2 mt-0.5 text-[11px]">
                                        {ws.content}
                                      </div>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Curriculum Sources Chips */}
                            {!m.refusal && m.sources && m.sources.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-100">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                  NCERT Curriculum Sources
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {m.sources.map((src, i) => (
                                    <span
                                      key={i}
                                      className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200"
                                    >
                                      {src.book}
                                      {src.part ? ` ${src.part}` : ""}, Ch {src.chapterNumber} (p. {src.pages?.join(", ")})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Figures Strip */}
                            {!m.refusal && m.images && m.images.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-slate-100">
                                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                  Textbook Figures ({m.images.length})
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {m.images.map((img) => (
                                    <div
                                      key={img.id}
                                      onClick={() => setLightboxImage(img.url)}
                                      className="group relative rounded-xl border border-slate-200 bg-slate-50 p-1 cursor-pointer hover:border-blue-400"
                                    >
                                      <img src={img.url} alt={img.caption} className="w-full h-20 object-contain rounded-lg" />
                                      <div className="mt-1 text-[10px] text-slate-500 truncate text-center">
                                        {img.caption}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm">{m.content}</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-4 border-t border-slate-200 bg-white">
                <form onSubmit={handleSendChat} className="max-w-4xl mx-auto flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask any NCERT question or syllabus preparation topic..."
                    disabled={isStreaming}
                    className="flex-1 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isStreaming || !chatInput.trim()}
                    className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: STUDENTS & GROUPS MANAGEMENT */}
        {/* ========================================================================= */}
        {activeTab === "groups" && (
          <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Academic Subject Groups & Enrolled Students
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage student access per subject. Students can only query textbooks in their enrolled groups.
                </p>
              </div>
              <button
                onClick={() => {
                  setCreateStudentError(null);
                  setCreateStudentSuccess(null);
                  setShowCreateStudentModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Student</span>
              </button>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((grp) => (
                <div
                  key={grp.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        {grp.name}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        {grp.memberCount} Students
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-4">
                      Subject: <span className="font-semibold text-slate-700">{grp.subjectName}</span>
                    </div>

                    {/* Member Pills */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {grp.members.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">No students enrolled yet</span>
                      ) : (
                        grp.members.map((mem) => (
                          <div
                            key={mem.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs"
                          >
                            <span>{mem.name}</span>
                            <button
                              onClick={() => handleRemoveMember(grp.id, mem.id)}
                              className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove from group"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Add Student Dropdown */}
                  <div className="pt-3 border-t border-slate-100">
                    {addingToGroupId === grp.id ? (
                      <div className="space-y-2">
                        <select
                          onChange={(e) => {
                            if (e.target.value) handleAddMember(grp.id, e.target.value);
                          }}
                          defaultValue=""
                          className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-slate-800"
                        >
                          <option value="" disabled>
                            Select student to enroll...
                          </option>
                          {allStudentsList
                            .filter((st) => !grp.members.some((m) => m.id === st.id))
                            .map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name}
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => setAddingToGroupId(null)}
                          className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToGroupId(grp.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/40 text-xs font-semibold transition-all cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Enroll Student</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* CHAPTER DRILL-DOWN MODAL */}
      {/* ========================================================================= */}
      {selectedChapterDetail && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedChapterDetail(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedChapterDetail.subjectName}: Ch {selectedChapterDetail.chapterNumber} -{" "}
                  {selectedChapterDetail.chapterTitle}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedChapterDetail.bookTitle}
                  {selectedChapterDetail.bookPart ? ` (${selectedChapterDetail.bookPart})` : ""} •{" "}
                  {selectedChapterDetail.count} questions logged
                </p>
              </div>
              <button
                onClick={() => setSelectedChapterDetail(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Logged Student Queries for this Chapter
              </div>
              {selectedChapterDetail.questions.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No specific query text captured.</div>
              ) : (
                selectedChapterDetail.questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{q.query}</div>
                      {q.studentName && (
                        <div className="text-[11px] text-blue-600 mt-0.5">Asked by {q.studentName}</div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STUDENT ACTIVITY DRILL-DOWN MODAL */}
      {/* ========================================================================= */}
      {selectedStudentDetail && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedStudentDetail(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedStudentDetail.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500">
                    Groups: {selectedStudentDetail.groups.join(", ") || "None"}
                  </span>
                  <span className="text-xs text-slate-300">•</span>
                  <span className="text-xs text-blue-700 font-bold">
                    {selectedStudentDetail.questionCount} Questions Asked
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentDetail(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Privacy Reassurance Notice */}
            <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-100 text-[11px] text-blue-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                Student memory facts, personal statements, and full chat sessions are protected and hidden from educator view. Only logged query terms are shown.
              </span>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Recent Logged Questions
              </div>
              {selectedStudentDetail.recentQuestions.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No recent logged questions found.</div>
              ) : (
                selectedStudentDetail.recentQuestions.map((q) => (
                  <div
                    key={q.id}
                    className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{q.query}</div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span className="font-medium text-slate-600">{q.chapterTitle}</span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${q.answered ? "text-emerald-600" : "text-amber-600"}`}
                        >
                          {q.answered ? "Answered from textbook" : "Out of syllabus / Refused"}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE STUDENT MODAL */}
      {/* ========================================================================= */}
      {showCreateStudentModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowCreateStudentModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create New Student</h3>
                  <p className="text-xs text-slate-500">Create login credentials and assign to academic groups</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateStudentModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="p-5 space-y-4">
              {createStudentError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createStudentError}</span>
                </div>
              )}

              {createStudentSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{createStudentSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={createStudentName}
                  onChange={(e) => setCreateStudentName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. john.doe@school.edu"
                  value={createStudentEmail}
                  onChange={(e) => setCreateStudentEmail(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  value={createStudentPassword}
                  onChange={(e) => setCreateStudentPassword(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Enroll in Academic Groups
                </label>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                  {groups.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">No groups available.</div>
                  ) : (
                    groups.map((grp) => {
                      const isChecked = createStudentGroupIds.includes(grp.id);
                      return (
                        <label
                          key={grp.id}
                          className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setCreateStudentGroupIds((prev) => prev.filter((id) => id !== grp.id));
                              } else {
                                setCreateStudentGroupIds((prev) => [...prev, grp.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium">{grp.name}</span>
                          <span className="text-[10px] text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
                            {grp.subjectName}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateStudentModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStudentLoading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {createStudentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{createStudentLoading ? "Creating..." : "Create Account"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
