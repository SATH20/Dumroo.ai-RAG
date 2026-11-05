"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
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
  Info,
  Check,
  Calendar,
  Filter,
  Edit2,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { Logo } from "@/components/brand/Logo";
import { Lightbox, LightboxFigure } from "@/components/Lightbox";
import { getSubjectTheme, SUBJECT_THEMES } from "@/lib/subjectTheme";

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

function TeacherPageInner() {
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
  const [managingGroup, setManagingGroup] = useState<TeacherGroup | null>(null);
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

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Teacher Ask (Chat) State
  const [teacherChats, setTeacherChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const isSelfCreatedChatRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [hasTavily, setHasTavily] = useState(true);
  const [activeLightbox, setActiveLightbox] = useState<{
    figures: LightboxFigure[];
    index: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Dumroo.ai · Teacher";
  }, []);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

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
          setStatCards(
            data.statCards || {
              totalStudents: 0,
              totalQuestions: 0,
              answeredCount: 0,
              answeredPercent: 0,
              notCoveredCount: 0,
            }
          );
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

    if (isSelfCreatedChatRef.current === activeChatId) {
      isSelfCreatedChatRef.current = null;
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
        showToast("Student added to group");
        await loadGroups();
        if (managingGroup?.id === groupId) {
          const updated = groups.find((g) => g.id === groupId);
          if (updated) setManagingGroup(updated);
        }
      }
    } catch (err) {
      console.error("Failed to add member:", err);
      showToast("Failed to add student to group", "error");
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
        showToast("Student removed from group");
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
        if (managingGroup?.id === groupId) {
          setManagingGroup((prev) =>
            prev
              ? {
                  ...prev,
                  members: prev.members.filter((m) => m.id !== studentId),
                  memberCount: Math.max(0, prev.memberCount - 1),
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error("Failed to remove member:", err);
      showToast("Failed to remove student", "error");
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

      showToast(`Student "${data.student.name}" created successfully!`);
      setCreateStudentSuccess(`Student "${data.student.name}" created!`);
      setCreateStudentName("");
      setCreateStudentEmail("");
      setCreateStudentPassword("");
      setCreateStudentGroupIds([]);
      await loadGroups();
      setTimeout(() => {
        setShowCreateStudentModal(false);
        setCreateStudentSuccess(null);
      }, 1000);
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
        if (mobileHistoryOpen) setMobileHistoryOpen(false);
      }
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  // Rename Teacher Chat
  const handleSaveRename = async (id: string) => {
    const trimmed = renameTitle.trim();
    if (!trimmed) {
      setRenamingChatId(null);
      setRenameTitle("");
      return;
    }
    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setTeacherChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
        );
        showToast("Discussion renamed");
      } else {
        showToast("Failed to rename discussion", "error");
      }
    } catch (err) {
      console.error("Failed to rename chat:", err);
      showToast("Failed to rename discussion", "error");
    } finally {
      setRenamingChatId(null);
      setRenameTitle("");
    }
  };

  // Delete Teacher Chat
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this discussion?")) return;

    try {
      const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTeacherChats((prev) => {
          const next = prev.filter((c) => c.id !== id);
          if (activeChatId === id) {
            const nextActive = next.length > 0 ? next[0].id : null;
            setActiveChatId(nextActive);
            if (!nextActive) {
              setMessages([]);
            }
          }
          return next;
        });
        showToast("Discussion deleted");
      } else {
        showToast("Failed to delete discussion", "error");
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
      showToast("Failed to delete discussion", "error");
    }
  };

  const renderChatItem = (c: any, isMobile = false) => {
    const isActive = c.id === activeChatId;
    const isRenaming = c.id === renamingChatId;

    if (isRenaming) {
      return (
        <div
          key={c.id}
          className="px-2 py-1.5 rounded-xl bg-slate-100 border border-[#1E4FF7] flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            autoFocus
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={() => handleSaveRename(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveRename(c.id);
              if (e.key === "Escape") {
                setRenamingChatId(null);
                setRenameTitle("");
              }
            }}
            className="w-full bg-white text-[#0F172A] px-2 py-1 rounded text-xs border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1E4FF7]"
          />
          <button
            type="button"
            onClick={() => handleSaveRename(c.id)}
            className="p-1 text-[#1E4FF7] hover:bg-blue-50 rounded"
            title="Save title"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setRenamingChatId(null);
              setRenameTitle("");
            }}
            className="p-1 text-slate-400 hover:bg-slate-200 rounded"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    }

    return (
      <div
        key={c.id}
        onClick={() => {
          setActiveChatId(c.id);
          if (isMobile) setMobileHistoryOpen(false);
        }}
        className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all ${
          isActive
            ? "bg-[#1E4FF7] text-white shadow-xs"
            : "text-slate-700 hover:bg-slate-100"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-1">
          <MessageSquare
            className={`w-3.5 h-3.5 shrink-0 ${
              isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"
            }`}
          />
          <span className="truncate">{c.title || "Untitled Discussion"}</span>
        </div>

        <div
          className={`flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 ${
            isActive ? "text-white" : "text-slate-500"
          }`}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingChatId(c.id);
              setRenameTitle(c.title || "");
            }}
            className={`p-1 rounded transition-colors ${
              isActive
                ? "hover:bg-white/20 hover:text-white text-white/90"
                : "hover:bg-slate-200/80 hover:text-[#1E4FF7] text-slate-400"
            }`}
            title="Rename discussion"
            aria-label="Rename discussion"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => handleDeleteChat(c.id, e)}
            className={`p-1 rounded transition-colors ${
              isActive
                ? "hover:bg-red-500/30 hover:text-red-100 text-white/90"
                : "hover:bg-red-50 hover:text-red-600 text-slate-400"
            }`}
            title="Delete discussion"
            aria-label="Delete discussion"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
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
          isSelfCreatedChatRef.current = chatId;
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
          const eventLine = block.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = block.split("\n").find((l) => l.startsWith("data:"));

          if (!eventLine || !dataLine) continue;
          const event = eventLine.replace("event:", "").trim();
          const data = JSON.parse(dataLine.replace("data:", "").trim());

          if (event === "meta") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      sources: data.sources || [],
                      images: data.images || [],
                      pageImages: data.pageImages || [],
                      webSources: data.webSources || [],
                    }
                  : m
              )
            );
          } else if (event === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + data.delta }
                  : m
              )
            );
          } else if (event === "refusal") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, refusal: true, content: data.message, sources: [], images: [], webSources: [] }
                  : m
              )
            );
          } else if (event === "cutoff") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, cutoff: true } : m))
            );
          } else if (event === "error") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, isError: true, content: data.message || "Failed to complete answer" }
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
      console.error("Teacher chat error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, isStreaming: false, isError: true, content: "Request failed. Please try again." }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F8FC] gap-5">
        <Logo variant="compact" size="lg" />
        <div className="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-[#64748B]">Loading teacher portal…</p>
      </div>
    );
  }

  const teacherInitials =
    currentUser?.fullName
      ?.split(" ")
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "TC";

  return (
    <div className="flex flex-col h-screen bg-[#F7F8FC] font-sans overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl card-shadow bg-[#0F172A] text-white text-xs font-semibold animate-fadeIn border border-white/10">
          {toastMessage.type === "success" ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Lightbox Modal */}
      <Lightbox
        figures={activeLightbox?.figures}
        initialIndex={activeLightbox?.index || 0}
        onClose={() => setActiveLightbox(null)}
        alt="Enlarged textbook figure"
      />

      {/* TOP NAVIGATION BAR */}
      <header className="h-16 px-6 bg-white border-b border-[#E6E8F0] flex items-center justify-between shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Logo variant="compact" size="md" />
          <span className="text-xs font-heading font-semibold px-2.5 py-0.5 rounded-full bg-[#EEF2FF] text-[#1E4FF7] border border-[#C7D2FE]">
            Teacher
          </span>
        </div>

        {/* Segmented Control Tabs */}
        <div className="bg-slate-100 p-1 rounded-full border border-slate-200 flex items-center gap-1 shadow-inner">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-4 py-1.5 rounded-full text-xs font-heading font-semibold transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-white text-[#0F172A] shadow-xs"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab("ask")}
            className={`px-4 py-1.5 rounded-full text-xs font-heading font-semibold transition-all cursor-pointer ${
              activeTab === "ask"
                ? "bg-white text-[#0F172A] shadow-xs"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Ask</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`px-4 py-1.5 rounded-full text-xs font-heading font-semibold transition-all cursor-pointer ${
              activeTab === "groups"
                ? "bg-white text-[#0F172A] shadow-xs"
                : "text-[#64748B] hover:text-[#0F172A]"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>Students & Groups</span>
            </div>
          </button>
        </div>

        {/* Right User Card & Logout */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#1E4FF7] to-[#7C3AED] text-white flex items-center justify-center font-heading font-bold text-xs shrink-0 shadow-xs">
              {teacherInitials}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-[#0F172A] leading-tight">
                {currentUser?.fullName}
              </div>
              <div className="text-[10px] text-[#64748B]">Instructor</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* CONTENT VIEWS */}
      <div className="flex-1 overflow-y-auto">
        {/* ===================== TAB 1: DASHBOARD ===================== */}
        {activeTab === "dashboard" && (
          <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6 animate-fadeIn">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#E6E8F0] card-shadow">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#1E4FF7]" />
                <span className="text-xs font-heading font-bold uppercase tracking-wider text-[#0F172A]">
                  Filters
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Subject Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#64748B]">Subject:</span>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#E6E8F0] bg-white text-[#0F172A] focus:outline-none"
                  >
                    <option value="all">All Subjects</option>
                    {allSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Range Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#64748B]">Time range:</span>
                  <div className="bg-slate-100 p-0.5 rounded-full border border-slate-200 flex items-center">
                    {[7, 14, 30].map((days) => (
                      <button
                        key={days}
                        onClick={() => setSelectedDays(days)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                          selectedDays === days
                            ? "bg-white text-[#0F172A] shadow-xs"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <div className="bg-white p-5 rounded-2xl border border-[#E6E8F0] card-shadow flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                    Questions Asked
                  </div>
                  <div className="text-3xl font-heading font-extrabold text-[#0F172A]">
                    {statCards.totalQuestions}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    Past {selectedDays} days
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#EEF2FF] text-[#1E4FF7] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#E6E8F0] card-shadow flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                    Answer Rate
                  </div>
                  <div className="text-3xl font-heading font-extrabold text-emerald-600">
                    {statCards.answeredPercent}%
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    {statCards.answeredCount} answered
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#E6E8F0] card-shadow flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                    Active Students
                  </div>
                  <div className="text-3xl font-heading font-extrabold text-[#0F172A]">
                    {statCards.totalStudents}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    Engaging with RAG tutor
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#E6E8F0] card-shadow flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-1">
                    Not Covered Gaps
                  </div>
                  <div className="text-3xl font-heading font-extrabold text-amber-600">
                    {statCards.notCoveredCount}
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-1">
                    Off-syllabus questions
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Daily Activity Area Chart */}
              <div className="bg-white p-6 rounded-2xl border border-[#E6E8F0] card-shadow flex flex-col justify-between">
                <div className="mb-4">
                  <h3 className="text-base font-heading font-bold text-[#0F172A]">
                    Daily Student Inquiries
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Volume of questions asked over the selected time window
                  </p>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={questionsPerDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1E4FF7" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#1E4FF7" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #E6E8F0",
                          boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="questions"
                        name="Questions"
                        stroke="#1E4FF7"
                        strokeWidth={2.5}
                        fill="url(#areaGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Questions by Subject Bar Chart */}
              <div className="bg-white p-6 rounded-2xl border border-[#E6E8F0] card-shadow flex flex-col justify-between">
                <div className="mb-4">
                  <h3 className="text-base font-heading font-bold text-[#0F172A]">
                    Questions by Subject
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Breakdown across curriculum subjects
                  </p>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={questionsPerSubject} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="subject" tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748B" }} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #E6E8F0",
                          boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" name="Questions" radius={[6, 6, 0, 0]}>
                        {questionsPerSubject.map((entry, index) => {
                          const theme = getSubjectTheme(entry.subject);
                          return <Cell key={`cell-${index}`} fill={theme.color} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Tables & Lists Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Most Asked Chapters */}
              <div className="bg-white p-6 rounded-2xl border border-[#E6E8F0] card-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-heading font-bold text-[#0F172A]">
                      Most Asked Chapters
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Chapters with highest question volume
                    </p>
                  </div>
                </div>

                {mostAskedChapters.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#64748B]">
                    No question activity recorded in this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E6E8F0] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                          <th className="pb-2.5">Chapter</th>
                          <th className="pb-2.5">Subject</th>
                          <th className="pb-2.5 text-right">Count</th>
                          <th className="pb-2.5 pl-4">Volume</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E6E8F0]/60">
                        {mostAskedChapters.map((ch, idx) => {
                          const theme = getSubjectTheme(ch.subjectName);
                          return (
                            <tr
                              key={ch.chapterId || idx}
                              onClick={() => setSelectedChapterDetail(ch)}
                              className="group hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <td className="py-2.5 pr-2">
                                <div className="font-semibold text-[#0F172A] truncate max-w-[200px]">
                                  {ch.chapterTitle}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {ch.bookTitle} · Ch {ch.chapterNumber}
                                </div>
                              </td>
                              <td className="py-2.5">
                                <span
                                  className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                  style={{
                                    backgroundColor: theme.bgSoft,
                                    color: theme.color,
                                    borderColor: theme.border,
                                  }}
                                >
                                  {ch.subjectName}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-bold text-[#0F172A]">
                                {ch.count}
                              </td>
                              <td className="py-2.5 pl-4 w-28">
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(ch.percentage, 100)}%`,
                                      backgroundColor: theme.color,
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Syllabus Gaps (Not Covered) */}
              <div className="bg-white p-6 rounded-2xl border border-[#E6E8F0] card-shadow flex flex-col justify-between">
                <div>
                  <div className="mb-4">
                    <h3 className="text-base font-heading font-bold text-[#0F172A]">
                      Syllabus Gaps (Not Covered)
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Questions student asked that fell outside NCERT textbooks
                    </p>
                  </div>

                  {notCoveredQuestions.length === 0 ? (
                    <div className="py-12 text-center text-xs text-emerald-600 font-medium">
                      ✓ No syllabus gaps detected in this window.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {notCoveredQuestions.map((q, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl border-l-4 border-amber-500 bg-amber-50/50 border border-[#E6E8F0] text-xs flex items-start justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-800">
                              "{q.query}"
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Asked by {q.studentName || "Student"} · {new Date(q.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] uppercase font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            Refused
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Student Roster Table */}
            <div className="bg-white p-6 rounded-2xl border border-[#E6E8F0] card-shadow">
              <div className="mb-4">
                <h3 className="text-base font-heading font-bold text-[#0F172A]">
                  Student Activity Roster
                </h3>
                <p className="text-xs text-[#64748B]">
                  Live student engagement and learning progress
                </p>
              </div>

              {students.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#64748B]">
                  No active students enrolled yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E6E8F0] text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="pb-2.5">Student</th>
                        <th className="pb-2.5">Enrolled Subjects</th>
                        <th className="pb-2.5 text-center">Questions</th>
                        <th className="pb-2.5 text-right">Last Active</th>
                        <th className="pb-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6E8F0]/60">
                      {students.map((st) => (
                        <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-heading font-bold text-xs flex items-center justify-center shrink-0">
                                {st.name.charAt(0)}
                              </div>
                              <span className="font-semibold text-[#0F172A]">{st.name}</span>
                            </div>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-1">
                              {st.groups.map((g, idx) => {
                                const theme = getSubjectTheme(g);
                                return (
                                  <span
                                    key={idx}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                                    style={{
                                      backgroundColor: theme.bgSoft,
                                      color: theme.color,
                                      borderColor: theme.border,
                                    }}
                                  >
                                    {g}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3 text-center font-bold text-[#0F172A]">
                            {st.questionCount}
                          </td>
                          <td className="py-3 text-right text-slate-500 text-[11px]">
                            {st.lastActive ? new Date(st.lastActive).toLocaleDateString() : "Never"}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => setSelectedStudentDetail(st)}
                              className="px-3 py-1 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#1E4FF7] hover:bg-[#1E4FF7] hover:text-white transition-all cursor-pointer"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB 2: ASK (TEACHER CHAT) ===================== */}
        {activeTab === "ask" && (
          <div className="flex h-full overflow-hidden">
            {/* Mobile Discussions Drawer */}
            {mobileHistoryOpen && (
              <div className="fixed inset-0 z-50 md:hidden flex">
                <div
                  className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                  onClick={() => setMobileHistoryOpen(false)}
                />
                <div className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col p-4 z-10 animate-in slide-in-from-left duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
                    <div className="text-xs font-heading font-bold uppercase tracking-wider text-slate-700">
                      Discussions
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileHistoryOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={handleCreateTeacherChat}
                    className="w-full btn-brand-pill py-2.5 px-4 text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs mb-3"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New discussion</span>
                  </button>

                  <div className="flex-1 overflow-y-auto space-y-1">
                    {teacherChats.map((c) => renderChatItem(c, true))}
                    {teacherChats.length === 0 && (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        No discussions yet. Click "New discussion" to start.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Sidebar of Teacher Conversations */}
            <div className="w-64 bg-white border-r border-[#E6E8F0] p-4 hidden md:flex flex-col shrink-0">
              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                <button
                  onClick={handleCreateTeacherChat}
                  className="w-full btn-brand-pill py-2.5 px-4 text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New discussion</span>
                </button>
                <div className="text-[11px] font-heading font-semibold uppercase text-slate-400 tracking-wider pt-2 shrink-0">
                  History
                </div>
                <div className="space-y-1 overflow-y-auto flex-1 pr-1">
                  {teacherChats.map((c) => renderChatItem(c, false))}
                  {teacherChats.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      No discussions yet. Click "New discussion" to start.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Chat Workspace */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F7F8FC]">
              {/* Toolbar with Web Search Toggle & Mobile Menu Trigger */}
              <div className="h-13 px-4 sm:px-6 bg-white border-b border-[#E6E8F0] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileHistoryOpen(true)}
                    className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-500 hover:text-[#0F172A] hover:bg-slate-100 transition-colors"
                    title="Discussions"
                    aria-label="Open discussions list"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                  <Sparkles className="w-4 h-4 text-[#1E4FF7] shrink-0" />
                  <span className="text-xs font-heading font-bold text-[#0F172A] truncate">
                    Curriculum & Web Knowledge Assistant
                  </span>
                </div>

                {/* Web Search Switch */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Globe className={`w-3.5 h-3.5 ${webSearchEnabled ? "text-[#F5A623]" : "text-slate-400"}`} />
                      <span>Web search</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={webSearchEnabled}
                      disabled={!hasTavily}
                      onChange={(e) => setWebSearchEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#1E4FF7] relative disabled:opacity-50" />
                  </label>
                  {!hasTavily && (
                    <span className="text-[10px] text-slate-400 italic">
                      (Tavily key missing, books only)
                    </span>
                  )}
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="max-w-3xl mx-auto space-y-6">
                  {messages.length === 0 ? (
                    <div className="py-16 text-center text-slate-500">
                      <div className="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center text-white mx-auto mb-4 shadow-sm">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-heading font-bold text-[#0F172A] mb-2">
                        Teacher Inquiry Assistant
                      </h3>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Ask about any chapter, generate curriculum quizzes, or research broader pedagogical concepts with Web Search enabled.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="animate-fadeIn">
                        {msg.role === "user" ? (
                          <div className="flex justify-end">
                            <div className="max-w-[80%] px-5 py-3 rounded-2xl rounded-br-sm bg-[#1E4FF7] text-white text-sm shadow-xs font-sans">
                              {msg.content}
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-3.5 items-start">
                            <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                              <Sparkles className="w-4 h-4 fill-white/20" />
                            </div>

                            <div className="flex-1 space-y-4">
                              {/* If both textbook and web sections exist, split into two distinct blocks */}
                              {msg.refusal ? (
                                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
                                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                  <p>{msg.content}</p>
                                </div>
                              ) : msg.isError ? (
                                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
                                  {msg.content}
                                </div>
                              ) : (
                                <div className="bg-white border border-[#E6E8F0] rounded-2xl card-shadow p-6 space-y-5">
                                  <div className="prose prose-slate max-w-none text-[#334155] leading-[1.75] text-[14.5px]">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm, remarkMath]}
                                      rehypePlugins={[rehypeKatex]}
                                    >
                                      {msg.content}
                                    </ReactMarkdown>
                                  </div>

                                  {/* Sources Badge Row */}
                                  {msg.sources && msg.sources.length > 0 && (
                                    <div className="pt-4 border-t border-[#E6E8F0]">
                                      <div className="text-[11px] font-heading font-bold text-[#64748B] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <BookOpen className="w-3.5 h-3.5" />
                                        <span>Curriculum Sources</span>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {msg.sources.map((s, idx) => (
                                          <span
                                            key={idx}
                                            className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EEF2FF] text-[#1E4FF7] border border-[#C7D2FE]"
                                          >
                                            {s.book} · Ch {s.chapterNumber} · p. {s.pages?.join(", ")}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Web Sources Cards */}
                                  {msg.webSources && msg.webSources.length > 0 && (
                                    <div className="pt-4 border-t border-[#E6E8F0]">
                                      <div className="text-[11px] font-heading font-bold text-[#64748B] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Globe className="w-3.5 h-3.5 text-[#F5A623]" />
                                        <span>Web Sources</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {msg.webSources.map((ws, idx) => (
                                          <a
                                            key={idx}
                                            href={ws.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-3 rounded-xl bg-slate-50 border border-[#E6E8F0] hover:border-[#1E4FF7]/40 hover:bg-white transition-all flex flex-col justify-between"
                                          >
                                            <div className="font-semibold text-xs text-[#0F172A] line-clamp-1 mb-1">
                                              {ws.title}
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                                              <span className="truncate max-w-[180px]">{ws.url}</span>
                                              <ExternalLink className="w-3 h-3 text-[#1E4FF7]" />
                                            </div>
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-[#E6E8F0]">
                <form onSubmit={handleSendChat} className="max-w-3xl mx-auto flex items-center gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask a question or request a curriculum summary..."
                    disabled={isStreaming}
                    className="flex-1 px-4 py-2.5 rounded-full border border-[#E6E8F0] bg-white text-sm text-[#0F172A] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isStreaming || !chatInput.trim()}
                    className="w-10 h-10 rounded-full btn-brand-pill flex items-center justify-center text-white disabled:opacity-40 cursor-pointer shadow-xs"
                    aria-label="Send query"
                  >
                    <Send className="w-4 h-4 ml-0.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB 3: STUDENTS & GROUPS ===================== */}
        {activeTab === "groups" && (
          <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-6 animate-fadeIn">
            {/* Header with Create Student Action */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#E6E8F0] card-shadow">
              <div>
                <h2 className="text-xl font-heading font-bold text-[#0F172A]">
                  Student Groups & Roster Management
                </h2>
                <p className="text-xs text-[#64748B]">
                  Manage class subject cohorts, enrollments, and student credentials
                </p>
              </div>
              <button
                onClick={() => setShowCreateStudentModal(true)}
                className="btn-brand-pill px-4 py-2.5 text-xs flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Student Account</span>
              </button>
            </div>

            {/* Groups Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {groups.map((grp) => {
                const theme = getSubjectTheme(grp.subjectName);
                return (
                  <div
                    key={grp.id}
                    className="bg-white rounded-2xl border border-[#E6E8F0] card-shadow overflow-hidden flex flex-col justify-between hover:border-[#1E4FF7]/40 transition-all"
                  >
                    <div>
                      {/* Subject Accent Top Line */}
                      <div className="h-2 w-full" style={{ backgroundColor: theme.color }} />
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-heading font-bold text-base text-[#0F172A]">
                            {grp.name}
                          </h3>
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: theme.bgSoft,
                              color: theme.color,
                              borderColor: theme.border,
                            }}
                          >
                            {grp.subjectName}
                          </span>
                        </div>

                        <div className="text-xs text-[#64748B] mb-4">
                          {grp.memberCount} enrolled student{grp.memberCount === 1 ? "" : "s"}
                        </div>

                        {/* Overlapping Avatars */}
                        <div className="flex items-center -space-x-2 overflow-hidden py-1">
                          {grp.members.slice(0, 5).map((m, idx) => (
                            <div
                              key={m.id || idx}
                              className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white text-[11px] font-heading font-bold text-slate-700 flex items-center justify-center shrink-0 shadow-xs"
                              title={m.name}
                            >
                              {m.name.charAt(0)}
                            </div>
                          ))}
                          {grp.memberCount > 5 && (
                            <div className="w-7 h-7 rounded-full bg-[#EEF2FF] border-2 border-white text-[10px] font-bold text-[#1E4FF7] flex items-center justify-center shrink-0">
                              +{grp.memberCount - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-[#E6E8F0] flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-medium">Cohort settings</span>
                      <button
                        onClick={() => setManagingGroup(grp)}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-[#E6E8F0] text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* CREATE STUDENT MODAL */}
      {showCreateStudentModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowCreateStudentModal(false)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 card-shadow border border-[#E6E8F0]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCreateStudentModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-[#0F172A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-heading font-bold text-[#0F172A] mb-1">
              Create Student Account
            </h3>
            <p className="text-xs text-[#64748B] mb-5">
              Creates a new student login and assigns them to subject cohorts.
            </p>

            {createStudentError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{createStudentError}</span>
              </div>
            )}

            {createStudentSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{createStudentSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={createStudentName}
                  onChange={(e) => setCreateStudentName(e.target.value)}
                  placeholder="e.g. Ananya Sen"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E6E8F0] text-xs text-[#0F172A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={createStudentEmail}
                  onChange={(e) => setCreateStudentEmail(e.target.value)}
                  placeholder="ananya@dumroo-demo.test"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E6E8F0] text-xs text-[#0F172A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1">
                  Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  value={createStudentPassword}
                  onChange={(e) => setCreateStudentPassword(e.target.value)}
                  placeholder="Demo@12345"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E6E8F0] text-xs text-[#0F172A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1.5">
                  Assign to Subject Groups
                </label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto p-2 rounded-xl border border-[#E6E8F0] bg-slate-50">
                  {groups.map((grp) => {
                    const isChecked = createStudentGroupIds.includes(grp.id);
                    return (
                      <label
                        key={grp.id}
                        className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCreateStudentGroupIds((prev) => [...prev, grp.id]);
                            } else {
                              setCreateStudentGroupIds((prev) =>
                                prev.filter((id) => id !== grp.id)
                              );
                            }
                          }}
                          className="rounded text-[#1E4FF7] focus:ring-[#1E4FF7]"
                        />
                        <span>{grp.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={createStudentLoading}
                  className="w-full btn-brand-pill py-2.5 text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {createStudentLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating student…</span>
                    </>
                  ) : (
                    <span>Create Account</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE GROUP MODAL */}
      {managingGroup && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setManagingGroup(null)}
        >
          <div
            className="relative w-full max-w-lg bg-white rounded-2xl p-6 sm:p-7 card-shadow border border-[#E6E8F0]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setManagingGroup(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-[#0F172A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-heading font-bold text-[#0F172A] mb-1">
              Manage {managingGroup.name}
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Enrolled students have access to {managingGroup.subjectName} textbooks.
            </p>

            {/* Members List */}
            <div className="space-y-2 mb-5 max-h-56 overflow-y-auto">
              {managingGroup.members.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  No students in this group yet.
                </p>
              ) : (
                managingGroup.members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <span className="font-semibold text-slate-800">{m.name}</span>
                    <button
                      onClick={() => handleRemoveMember(managingGroup.id, m.id)}
                      className="text-red-500 hover:text-red-700 text-xs font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Member Dropdown */}
            <div className="pt-3 border-t border-[#E6E8F0]">
              <label className="block text-xs font-semibold text-[#0F172A] uppercase mb-1.5">
                Add Student to Group
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="selectStudentToAdd"
                  className="flex-1 px-3 py-2 rounded-xl border border-[#E6E8F0] text-xs text-[#0F172A] bg-white focus:outline-none"
                >
                  <option value="">Select student…</option>
                  {allStudentsList
                    .filter((st) => !managingGroup.members.some((m) => m.id === st.id))
                    .map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => {
                    const sel = document.getElementById("selectStudentToAdd") as HTMLSelectElement;
                    if (sel && sel.value) {
                      handleAddMember(managingGroup.id, sel.value);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-[#1E4FF7] text-white text-xs font-semibold hover:bg-[#1A42D4] transition-colors cursor-pointer shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STUDENT DETAILS DRAWER */}
      {selectedStudentDetail && (
        <div
          className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-sm flex justify-end animate-fadeIn"
          onClick={() => setSelectedStudentDetail(null)}
        >
          <div
            className="w-full max-w-md bg-white h-full p-6 sm:p-7 card-shadow overflow-y-auto flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#E6E8F0] mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1E4FF7]/15 text-[#1E4FF7] font-heading font-bold text-sm flex items-center justify-center">
                    {selectedStudentDetail.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-[#0F172A]">
                      {selectedStudentDetail.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Total inquiries: {selectedStudentDetail.questionCount}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedStudentDetail(null)}
                  className="text-slate-400 hover:text-[#0F172A] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-heading font-semibold uppercase text-slate-400 mb-1.5">
                    Enrolled Cohorts
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedStudentDetail.groups.map((g, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-heading font-semibold uppercase text-slate-400 mb-2">
                    Recent Questions Asked
                  </div>
                  <div className="space-y-2">
                    {selectedStudentDetail.recentQuestions.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No recent questions logged.</p>
                    ) : (
                      selectedStudentDetail.recentQuestions.map((q) => (
                        <div
                          key={q.id}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                        >
                          <div className="font-semibold text-[#0F172A]">"{q.query}"</div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>{q.chapterTitle || "General Curriculum"}</span>
                            <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E6E8F0]">
              <button
                onClick={() => setSelectedStudentDetail(null)}
                className="w-full py-2.5 rounded-full bg-slate-100 text-[#0F172A] text-xs font-semibold hover:bg-slate-200 transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] gap-5">
          <Logo variant="compact" size="lg" />
          <div className="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TeacherPageInner />
    </Suspense>
  );
}
