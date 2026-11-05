"use client";

import React, { useState, useEffect, useRef, Component, ErrorInfo, ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  BookOpen,
  Send,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  Maximize2,
  RotateCcw,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  Menu,
  Brain,
  LogOut,
  User,
  GraduationCap,
} from "lucide-react";

interface Subject {
  id: string;
  name: string;
}

interface Source {
  chapterId?: string;
  subject: string;
  book: string;
  part: string | null;
  chapterNumber: number;
  chapterTitle: string;
  sectionTitle: string;
  pages: number[];
}

interface ImageItem {
  id: string;
  url: string;
  pageNumber: number;
  width: number;
  height: number;
  caption: string;
}

interface PageImageItem {
  id: string;
  url: string;
  pageNumber: number;
  chapterNumber: number;
  chapterTitle: string;
}

interface SectionExport {
  chapterTitle: string;
  sectionTitle: string;
  chunks: Array<{
    pageNumber: number;
    chunkIndex: number;
    content: string;
  }>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  refusal?: boolean;
  cutoff?: boolean;
  isError?: boolean;
  isRateLimited?: boolean;
  standaloneQuery?: string;
  userQuestion?: string;
  sources?: Source[];
  images?: ImageItem[];
  pageImages?: PageImageItem[];
  sections?: SectionExport[];
}

interface Chat {
  id: string;
  title: string;
  summary?: string;
  updated_at: string;
}

class MarkdownErrorBoundary extends Component<{ children: ReactNode; fallbackText: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallbackText: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("Markdown/KaTeX rendering error caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="whitespace-pre-wrap font-sans text-slate-800 text-sm leading-relaxed">
          {this.props.fallbackText}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function StudentDashboard() {
  const router = useRouter();

  // User & Allowed Subjects state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allowedSubjects, setAllowedSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Multi-Chat State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Student Memory State
  const [studentFacts, setStudentFacts] = useState<string[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);

  // Active Chat Messages & Stream state
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDev = process.env.NODE_ENV === "development";

  // 1. Load Session & User Profile
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (!data.user) {
          router.push("/login");
          return;
        }
        setCurrentUser(data.user);
        setAllowedSubjects(data.allowedSubjects || []);
      } catch (err) {
        console.error("Session load error:", err);
        router.push("/login");
      }
    }
    loadSession();
  }, [router]);

  // 2. Load Chats & Memory
  useEffect(() => {
    if (!currentUser) return;

    async function loadChatsAndMemory() {
      try {
        const [chatsRes, memRes] = await Promise.all([
          fetch("/api/chats"),
          fetch("/api/memory"),
        ]);
        if (chatsRes.ok) {
          const cData = await chatsRes.json();
          setChats(cData.chats || []);
          if (cData.chats && cData.chats.length > 0 && !activeChatId) {
            setActiveChatId(cData.chats[0].id);
          }
        }
        if (memRes.ok) {
          const mData = await memRes.json();
          setStudentFacts(mData.facts || []);
        }
      } catch (err) {
        console.warn("Failed to load chats/memory:", err);
      }
    }

    loadChatsAndMemory();
  }, [currentUser]);

  // 3. Load Messages for Active Chat
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
        console.warn("Failed to load chat messages:", err);
      }
    }

    loadMessages();
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Create New Chat
  const handleNewChat = async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      if (res.ok) {
        const data = await res.json();
        setChats((prev) => [data.chat, ...prev]);
        setActiveChatId(data.chat.id);
        setMessages([]);
        if (window.innerWidth < 768) setSidebarOpen(false);
      }
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  // Rename Chat
  const handleSaveRename = async (id: string) => {
    if (!renameTitle.trim()) {
      setRenamingChatId(null);
      return;
    }
    try {
      const res = await fetch(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameTitle.trim() }),
      });
      if (res.ok) {
        setChats((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: renameTitle.trim() } : c))
        );
      }
    } finally {
      setRenamingChatId(null);
      setRenameTitle("");
    }
  };

  // Delete Chat
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;

    try {
      const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
      if (res.ok) {
        setChats((prev) => {
          const next = prev.filter((c) => c.id !== id);
          if (activeChatId === id) {
            setActiveChatId(next.length > 0 ? next[0].id : null);
          }
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  };

  // Delete Memory Fact
  const handleDeleteFact = async (fact: string) => {
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact }),
      });
      if (res.ok) {
        setStudentFacts((prev) => prev.filter((f) => f !== fact));
      }
    } catch (err) {
      console.error("Failed to delete fact:", err);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  // Send Message / Ask Question
  const handleAsk = async (e?: React.FormEvent, retryPrompt?: string) => {
    if (e) e.preventDefault();
    const query = (retryPrompt || inputQuery).trim();
    if (!query || isStreaming) return;

    let targetChatId = activeChatId;

    // If no active chat exists, create one first
    if (!targetChatId) {
      try {
        const createRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: query.slice(0, 30) }),
        });
        if (createRes.ok) {
          const cData = await createRes.json();
          targetChatId = cData.chat.id;
          setActiveChatId(targetChatId);
          setChats((prev) => [cData.chat, ...prev]);
        }
      } catch (err) {
        console.error("Could not create chat:", err);
      }
    }

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    const newMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: "user", content: query },
      { id: assistantMsgId, role: "assistant", content: "", isStreaming: true, userQuestion: query },
    ];

    setMessages(newMessages);
    if (!retryPrompt) setInputQuery("");
    setIsStreaming(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content.slice(0, 600),
        chapterIds: m.sources ? m.sources.map((s) => s.chapterId).filter(Boolean) : [],
        sources: m.sources || [],
      }));

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          subjectIds: selectedSubjectId ? [selectedSubjectId] : allowedSubjects.map((s) => s.id),
          history: historyPayload,
          chatId: targetChatId,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  isStreaming: false,
                  isError: true,
                  isRateLimited: res.status === 429,
                  content: errJson.error || "The tutor is busy right now, please try again",
                }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
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
                      sections: data.sections || [],
                      standaloneQuery: data.standaloneQuery,
                    }
                  : m
              )
            );
          } else if (event === "token") {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: m.content + data.delta } : m))
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
                      sections: [],
                    }
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
                  ? { ...m, isError: true, content: data.message || "The tutor is busy right now, please try again" }
                  : m
              )
            );
          } else if (event === "done") {
            if (Array.isArray(data.facts)) {
              setStudentFacts(data.facts);
            }
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
            );
          }
        }
      }

      // Re-fetch memory facts in background to update UI with newly extracted facts
      fetch("/api/memory")
        .then((r) => r.json())
        .then((d) => setStudentFacts(d.facts || []))
        .catch(() => {});
    } catch (err: any) {
      console.error("Ask query error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                isStreaming: false,
                isError: true,
                content: "The tutor is busy right now, please try again",
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-2 shadow-2xl overflow-hidden flex flex-col">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={lightboxImage} alt="Enlarged textbook figure" className="w-full h-auto max-h-[85vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ChatGPT-style Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <BookOpen className="w-5 h-5" />
            </div>
            <span className="font-bold tracking-tight text-white">
              Dumroo<span className="text-blue-400">.ai</span>
            </span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Chat List (Most Recent First) */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Recent Conversations
          </div>

          {chats.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">
              No conversations yet. Start a new chat!
            </div>
          ) : (
            chats.map((c) => {
              const isActive = c.id === activeChatId;
              const isRenaming = renamingChatId === c.id;

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveChatId(c.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-slate-800 text-white font-medium"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0 pr-1">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-blue-400" : "text-slate-500"}`} />
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={renameTitle}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(c.id);
                          if (e.key === "Escape") setRenamingChatId(null);
                        }}
                        className="w-full bg-slate-700 text-white text-xs px-1.5 py-0.5 rounded outline-none border border-blue-500"
                      />
                    ) : (
                      <span className="truncate">{c.title || "Untitled Chat"}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isRenaming ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveRename(c.id);
                        }}
                        className="p-1 hover:text-emerald-400 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingChatId(c.id);
                          setRenameTitle(c.title);
                        }}
                        className="p-1 hover:text-blue-400 cursor-pointer"
                        title="Rename Chat"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDeleteChat(c.id, e)}
                      className="p-1 hover:text-rose-400 cursor-pointer"
                      title="Delete Chat"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Cross-Chat Memory Panel Trigger */}
        <div className="p-3 border-t border-slate-800">
          <button
            onClick={() => setMemoryOpen(!memoryOpen)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="font-medium">What I Remember</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-800">
              {studentFacts.length}
            </span>
          </button>
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-semibold text-xs shrink-0">
              {currentUser?.fullName?.charAt(0) || "S"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-200 truncate">{currentUser?.fullName}</div>
              <div className="text-[10px] text-slate-500 truncate">{currentUser?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900">
                  {chats.find((c) => c.id === activeChatId)?.title || "NCERT AI Tutor"}
                </h1>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Student
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                NCERT Curriculum Class 11 • Strict Grounding
              </div>
            </div>
          </div>

          {/* Allowed Subjects Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-md py-1">
            <button
              onClick={() => setSelectedSubjectId(null)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-colors cursor-pointer ${
                selectedSubjectId === null
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Allowed ({allowedSubjects.length})
            </button>
            {allowedSubjects.map((s) => {
              const active = selectedSubjectId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSubjectId(active ? null : s.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize shrink-0 transition-colors cursor-pointer ${
                    active
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </header>

        {/* Student Memory Slide-out Modal / Drawer */}
        {memoryOpen && (
          <div className="bg-purple-50/90 border-b border-purple-200 px-6 py-4 transition-all">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-900 uppercase tracking-wider">
                <Brain className="w-4 h-4 text-purple-600" />
                What I Remember About You (Cross-Chat Memory)
              </div>
              <button
                onClick={() => setMemoryOpen(false)}
                className="text-purple-600 hover:text-purple-900 text-xs font-semibold"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-purple-700 mb-3">
              These durable preferences personalize pedagogical tone, level, and follow-ups. All factual answers still strictly come from NCERT textbooks.
            </p>
            {studentFacts.length === 0 ? (
              <div className="text-xs text-purple-600 italic">
                No personalized facts remembered yet. As you ask questions like "I find integration hard" or "I prefer short answers", they will appear here.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {studentFacts.map((fact, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-purple-200 text-purple-950 text-xs shadow-2xs"
                  >
                    <span>{fact}</span>
                    <button
                      onClick={() => handleDeleteFact(fact)}
                      className="text-purple-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                      title="Delete this fact"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages Stream Container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4 shadow-2xs">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                Welcome, {currentUser?.fullName || "Student"}!
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-6 max-w-sm">
                Ask any question from your enrolled NCERT subjects:{" "}
                <span className="font-semibold text-slate-700">
                  {allowedSubjects.map((s) => s.name).join(", ") || "Enrolled Subjects"}
                </span>
                .
              </p>

              {/* Sample Quick Questions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left">
                {allowedSubjects.some((s) => s.name.toLowerCase().includes("physic")) && (
                  <button
                    onClick={() => handleAsk(undefined, "Explain Newton's second law")}
                    className="p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-xs text-slate-700 transition-all cursor-pointer shadow-2xs"
                  >
                    <div className="font-semibold text-slate-900">Physics</div>
                    <div className="text-slate-500 mt-0.5">Explain Newton&apos;s second law</div>
                  </button>
                )}
                {allowedSubjects.some((s) => s.name.toLowerCase().includes("math")) && (
                  <button
                    onClick={() => handleAsk(undefined, "What is a set in mathematics?")}
                    className="p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-xs text-slate-700 transition-all cursor-pointer shadow-2xs"
                  >
                    <div className="font-semibold text-slate-900">Mathematics</div>
                    <div className="text-slate-500 mt-0.5">What is a set in mathematics?</div>
                  </button>
                )}
                {allowedSubjects.some((s) => s.name.toLowerCase().includes("chem")) && (
                  <button
                    onClick={() => handleAsk(undefined, "Explain the mole concept")}
                    className="p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-xs text-slate-700 transition-all cursor-pointer shadow-2xs"
                  >
                    <div className="font-semibold text-slate-900">Chemistry</div>
                    <div className="text-slate-500 mt-0.5">Explain the mole concept</div>
                  </button>
                )}
                {allowedSubjects.some((s) => s.name.toLowerCase().includes("bio")) && (
                  <button
                    onClick={() => handleAsk(undefined, "How does photosynthesis work?")}
                    className="p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-xs text-slate-700 transition-all cursor-pointer shadow-2xs"
                  >
                    <div className="font-semibold text-slate-900">Biology</div>
                    <div className="text-slate-500 mt-0.5">How does photosynthesis work?</div>
                  </button>
                )}
                {allowedSubjects.some((s) => s.name.toLowerCase().includes("hist")) && (
                  <button
                    onClick={() => handleAsk(undefined, "Who was Genghis Khan?")}
                    className="p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-xs text-slate-700 transition-all cursor-pointer shadow-2xs"
                  >
                    <div className="font-semibold text-slate-900">History</div>
                    <div className="text-slate-500 mt-0.5">Who was Genghis Khan?</div>
                  </button>
                )}
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
                      : "bg-white text-slate-800 border border-slate-200/90"
                  }`}
                >
                  {/* Assistant Answer Body */}
                  {m.role === "assistant" ? (
                    <div>
                      {/* Refusal / Group Restriction Alert */}
                      {m.refusal && (
                        <div className="p-3.5 mb-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold">Textbook Coverage Notice</div>
                            <div className="whitespace-pre-line mt-1">{m.content}</div>
                          </div>
                        </div>
                      )}

                      {/* Error or Rate Limit Alert */}
                      {m.isError && (
                        <div className="p-3.5 mb-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="font-semibold">
                              {m.isRateLimited ? "Rate Limit Reached" : "Error"}
                            </div>
                            <div>{m.content}</div>
                            {!m.isRateLimited && (
                              <button
                                onClick={() => handleAsk(undefined, m.userQuestion || "")}
                                className="mt-2 flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-300 rounded-lg text-rose-700 hover:bg-rose-100 font-medium cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Retry
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Rendered Markdown + LaTeX Content */}
                      {!m.refusal && !m.isError && (
                        <MarkdownErrorBoundary fallbackText={m.content}>
                          <div className="prose prose-slate prose-sm max-w-none text-slate-800 leading-relaxed font-sans">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                            >
                              {m.content.replace(/\[\[(?:NOT_)?COVERED\]\]\s*/g, "")}
                            </ReactMarkdown>
                          </div>
                        </MarkdownErrorBoundary>
                      )}

                      {/* Truncation / Cutoff Banner */}
                      {m.cutoff && (
                        <div className="mt-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-800">
                          <span>Answer was cut off, regenerate</span>
                          <button
                            onClick={() => handleAsk(undefined, m.userQuestion || "")}
                            className="flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Regenerate
                          </button>
                        </div>
                      )}

                      {/* Sources Chips - ONLY when answered and not refusal */}
                      {!m.refusal && !m.isError && m.sources && m.sources.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Curriculum Sources
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.sources.map((src, i) => (
                              <span
                                key={i}
                                className="text-[11px] font-medium bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200"
                              >
                                {src.book}
                                {src.part ? ` ${src.part}` : ""}, Ch {src.chapterNumber} (p.{" "}
                                {src.pages.join(", ")})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Figures Strip - ONLY when answered and not refusal */}
                      {!m.refusal && !m.isError && m.images && m.images.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                            Key Textbook Figures ({m.images.length})
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {m.images.map((img) => (
                              <div
                                key={img.id}
                                onClick={() => setLightboxImage(img.url)}
                                className="group relative rounded-xl border border-slate-200 bg-slate-50 p-1.5 cursor-pointer hover:border-blue-400 hover:shadow-xs transition-all"
                              >
                                <img
                                  src={img.url}
                                  alt={img.caption}
                                  className="w-full h-20 object-contain rounded-lg"
                                />
                                <div className="mt-1 text-[10px] text-slate-500 truncate text-center">
                                  {img.caption}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Full Page Rendering Strip - ONLY when answered and not refusal */}
                      {!m.refusal && !m.isError && m.pageImages && m.pageImages.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                            View Original Textbook Pages ({m.pageImages.length})
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {m.pageImages.map((pi) => (
                              <div
                                key={pi.id}
                                onClick={() => setLightboxImage(pi.url)}
                                className="group relative shrink-0 w-24 rounded-xl border border-slate-200 bg-white p-1 cursor-pointer hover:border-emerald-400 hover:shadow-xs transition-all"
                              >
                                <img
                                  src={pi.url}
                                  alt={`Page ${pi.pageNumber}`}
                                  className="w-full h-32 object-cover object-top rounded-lg"
                                />
                                <div className="mt-1 text-[10px] font-medium text-slate-600 text-center">
                                  Page {pi.pageNumber}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Collapsible Extracted Content Panel - ONLY when answered and not refusal */}
                      {!m.refusal && !m.isError && m.sections && m.sections.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-100">
                          <button
                            onClick={() => toggleSection(m.id)}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              Extracted textbook text (formulas may look flattened, see original pages above)
                            </span>
                            {collapsedSections[m.id] ? (
                              <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                            )}
                          </button>

                          {collapsedSections[m.id] && (
                            <div className="mt-3 space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 max-h-60 overflow-y-auto">
                              {m.sections.map((sec, sIdx) => (
                                <div key={sIdx} className="space-y-1">
                                  <div className="font-bold text-slate-900">
                                    {sec.chapterTitle} &rarr; {sec.sectionTitle}
                                  </div>
                                  {sec.chunks.map((chk, cIdx) => (
                                    <div key={cIdx} className="pl-2 border-l-2 border-slate-300 py-1">
                                      <div className="text-[10px] text-slate-500 font-mono">
                                        Page {chk.pageNumber}
                                      </div>
                                      <div className="whitespace-pre-wrap">{chk.content}</div>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form Bar */}
        <div className="bg-white border-t border-slate-200 p-4 shrink-0 shadow-lg">
          <form onSubmit={handleAsk} className="max-w-4xl mx-auto flex items-center gap-2">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a question about your textbook topics..."
              disabled={isStreaming}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={isStreaming || !inputQuery.trim()}
              className="py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm flex items-center gap-2 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
