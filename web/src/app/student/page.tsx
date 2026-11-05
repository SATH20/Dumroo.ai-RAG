"use client";

import React, {
  useState,
  useEffect,
  useRef,
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
} from "react";
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
  AlertCircle,
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
  Copy,
  Info,
  ExternalLink,
  Search,
  Loader2,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Lightbox, LightboxFigure } from "@/components/Lightbox";
import { getSubjectTheme, SUBJECT_THEMES } from "@/lib/subjectTheme";

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
  thumbUrl?: string;
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
  webSources?: Array<{ title: string; url: string; content: string }>;
}

interface Chat {
  id: string;
  title: string;
  summary?: string;
  updated_at: string;
}

const SUGGESTED_BY_SUBJECT: Record<
  string,
  Array<{ question: string; chapter: string }>
> = {
  physics: [
    {
      question: "Explain Newton's second law of motion and momentum",
      chapter: "Laws of Motion · Ch 4",
    },
    {
      question: "Derive the equations of motion for uniform acceleration",
      chapter: "Motion in a Straight Line · Ch 2",
    },
  ],
  maths: [
    {
      question: "What is a set and how are sets represented?",
      chapter: "Sets · Ch 1",
    },
    {
      question: "Explain the binomial theorem with an example",
      chapter: "Binomial Theorem · Ch 7",
    },
  ],
  chemistry: [
    {
      question: "Explain hybridisation with examples of sp, sp², and sp³",
      chapter: "Chemical Bonding · Ch 4",
    },
    {
      question: "Explain the mole concept and molar mass calculation",
      chapter: "Basic Concepts of Chemistry · Ch 1",
    },
  ],
  biology: [
    {
      question: "Explain the light reaction in photosynthesis",
      chapter: "Photosynthesis · Ch 11",
    },
    {
      question: "Describe the phases of the cell cycle and mitosis",
      chapter: "Cell Cycle · Ch 10",
    },
  ],
  history: [
    {
      question: "Explain the military organization of Genghis Khan",
      chapter: "Nomadic Empires · Ch 5",
    },
    {
      question: "Describe Mesopotamian cities and early writing systems",
      chapter: "Writing and City Life · Ch 2",
    },
  ],
};

class MarkdownErrorBoundary extends Component<
  { children: ReactNode; fallbackText: string },
  { hasError: boolean }
> {
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

/**
 * Transforms inline curriculum citations like [Physics Part 1, Ch 4, p. 54]
 * into styled colored pill chips.
 */
function FormattedMessageContent({ content }: { content: string }) {
  // Regex to match citation brackets like [Physics Part 1, Ch 4, p. 54]
  const citationPattern =
    /\[((?:Physics|Chemistry|Biology|Mathematics|Maths|Themes|History)[^\]]*?(?:Ch|Chapter)\.?\s*\d+[^\]]*?)\]/gi;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index));
    }
    const innerCitation = match[1];
    const theme = getSubjectTheme(innerCitation);

    parts.push(
      <span
        key={`cit-${match.index}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 my-0.5 rounded-full text-xs font-semibold border shadow-xs select-none"
        style={{
          backgroundColor: theme.bgSoft,
          color: theme.color,
          borderColor: theme.border,
        }}
      >
        <BookOpen className="w-3 h-3 shrink-0" />
        <span>{innerCitation}</span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex));
  }

  return (
    <div className="prose prose-slate max-w-none text-[#334155] leading-[1.75] text-[14.5px]">
      <MarkdownErrorBoundary fallbackText={content}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => (
              <p className="mb-3.5 last:mb-0 leading-[1.75]">{children}</p>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-heading font-bold text-[#0F172A] mt-5 mb-2.5 tracking-tight border-b border-[#E6E8F0] pb-1.5">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-heading font-semibold text-[#0F172A] mt-4 mb-2 tracking-tight">
                {children}
              </h3>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-5 my-3 space-y-1.5">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-5 my-3 space-y-1.5">{children}</ol>
            ),
            li: ({ children }) => <li className="pl-1">{children}</li>,
            strong: ({ children }) => (
              <strong className="font-semibold text-[#0F172A]">{children}</strong>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-[#1E4FF7] pl-4 py-1 my-3 bg-[#EEF2FF]/50 rounded-r-xl italic text-slate-700">
                {children}
              </blockquote>
            ),
          }}
        >
          {content.replace(/\$(?=\d{1,3}(,\d{3})+(\.\d+)?|\d+\.\d{2}\b)/g, "\\$")}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    </div>
  );
}

function StudentDashboardInner() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // User & Allowed Subjects state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [allowedSubjects, setAllowedSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Multi-Chat State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const isSelfCreatedChatRef = useRef<string | null>(null);
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
  const [loadingStep, setLoadingStep] = useState(0); // 0: Searching, 1: Reading, 2: Writing
  const [activeLightbox, setActiveLightbox] = useState<{
    figures: LightboxFigure[];
    index: number;
  } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.title = "Dumroo.ai · Student";
  }, []);

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
            const savedChatId = typeof window !== "undefined" ? localStorage.getItem("dumroo_student_active_chat") : null;
            const targetChat = cData.chats.find((c: any) => c.id === savedChatId) || cData.chats[0];
            setActiveChatId(targetChat.id);
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
      setLoadingMessages(false);
      return;
    }

    if (isSelfCreatedChatRef.current === activeChatId) {
      isSelfCreatedChatRef.current = null;
      return;
    }

    let isCancelled = false;
    setLoadingMessages(true);
    setMessages([]); // Immediately clear previous chat content to prevent stale body flash

    async function loadMessages() {
      try {
        const res = await fetch(`/api/chats/${activeChatId}/messages`);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn("Failed to load chat messages:", err);
        }
      } finally {
        if (!isCancelled) {
          setLoadingMessages(false);
        }
      }
    }

    loadMessages();

    return () => {
      isCancelled = true;
    };
  }, [activeChatId]);

  useEffect(() => {
    if (activeChatId && typeof window !== "undefined") {
      localStorage.setItem("dumroo_student_active_chat", activeChatId);
    }
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Esc key closes lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveLightbox(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Step progression during stream start
  useEffect(() => {
    if (!isStreaming) {
      setLoadingStep(0);
      return;
    }
    const t1 = setTimeout(() => setLoadingStep(1), 1200);
    const t2 = setTimeout(() => setLoadingStep(2), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isStreaming]);

  // Auto-grow textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputQuery(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

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
          isSelfCreatedChatRef.current = targetChatId;
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
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
        userQuestion: query,
      },
    ];

    setMessages(newMessages);
    if (!retryPrompt) {
      setInputQuery("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    setIsStreaming(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content.slice(0, 600),
        chapterIds: m.sources
          ? m.sources.map((s) => s.chapterId).filter(Boolean)
          : [],
        sources: m.sources || [],
      }));

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: query,
          subjectIds: selectedSubjectId
            ? [selectedSubjectId]
            : allowedSubjects.map((s) => s.id),
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
                  content:
                    errJson.error ||
                    "The tutor is busy right now, please try again",
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
                      webSources: data.webSources || [],
                      standaloneQuery: data.standaloneQuery,
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
                  ? {
                      ...m,
                      isError: true,
                      content:
                        data.message ||
                        "The tutor is busy right now, please try again",
                    }
                  : m
              )
            );
          } else if (event === "done") {
            if (Array.isArray(data.facts)) {
              setStudentFacts(data.facts);
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m
              )
            );
            const title = query.trim().split(/\s+/).slice(0, 6).join(" ");
            setChats((prev) => prev.map((c) => c.id === targetChatId && c.title === "New Chat" ? { ...c, title } : c));
          }
        }
      }

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

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Group chats by date
  const groupChats = () => {
    if (!mounted) return { today: chats, yesterday: [], earlier: [] };
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    const today: Chat[] = [];
    const yesterday: Chat[] = [];
    const earlier: Chat[] = [];

    for (const c of chats) {
      const time = new Date(c.updated_at || Date.now()).getTime();
      if (time >= todayStart) {
        today.push(c);
      } else if (time >= yesterdayStart) {
        yesterday.push(c);
      } else {
        earlier.push(c);
      }
    }

    return { today, yesterday, earlier };
  };

  const { today, yesterday, earlier } = groupChats();

  // Pick 4 suggested questions based on enrolled subjects
  const getSuggestedCards = () => {
    const cards: Array<{ question: string; chapter: string; subject: string }> =
      [];
    const enrolledKeys = allowedSubjects.map((s) => s.name.toLowerCase());

    for (const key of enrolledKeys) {
      const normalizedKey = key.includes("phys")
        ? "physics"
        : key.includes("chem")
        ? "chemistry"
        : key.includes("bio")
        ? "biology"
        : key.includes("math")
        ? "maths"
        : key.includes("hist")
        ? "history"
        : "";

      if (normalizedKey && SUGGESTED_BY_SUBJECT[normalizedKey]) {
        for (const item of SUGGESTED_BY_SUBJECT[normalizedKey]) {
          if (cards.length < 4) {
            cards.push({ ...item, subject: normalizedKey });
          }
        }
      }
    }

    // Never suggest a subject the student is not enrolled in.
    if (cards.length < 4 && enrolledKeys.length === 0) {
      const fallbacks = [
        {
          question: "Explain Newton's second law of motion and momentum",
          chapter: "Physics Part 1 · Ch 4",
          subject: "physics",
        },
        {
          question: "What is a set and how are sets represented?",
          chapter: "Maths · Ch 1",
          subject: "maths",
        },
        {
          question: "Explain hybridisation with examples of sp, sp², and sp³",
          chapter: "Chemistry · Ch 4",
          subject: "chemistry",
        },
        {
          question: "Explain the light reaction in photosynthesis",
          chapter: "Biology · Ch 11",
          subject: "biology",
        },
      ];
      for (const fb of fallbacks) {
        if (cards.length < 4 && !cards.some((c) => c.question === fb.question)) {
          cards.push(fb);
        }
      }
    }

    return cards.slice(0, 4);
  };

  const suggestedCards = getSuggestedCards();
  const studentFirstName = currentUser?.full_name?.split(" ")[0] || "Student";
  const userInitials =
    currentUser?.full_name
      ?.split(" ")
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "ST";

  const activeChat = chats.find((c) => c.id === activeChatId);

  if (!currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F8FC] gap-5">
        <Logo variant="compact" size="lg" />
        <div className="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F7F8FC] overflow-hidden font-sans">
      {/* Lightbox Modal */}
      <Lightbox
        figures={activeLightbox?.figures}
        initialIndex={activeLightbox?.index || 0}
        onClose={() => setActiveLightbox(null)}
        alt="Textbook figure enlarged"
      />

      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0F172A]/60 backdrop-blur-xs md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR (Deep Navy #0B1530, 280px) */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-[280px] bg-[#0B1530] text-white flex flex-col shrink-0 transition-transform duration-200 ease-out md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <Logo variant="full" size="md" inPill />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-400 hover:text-white cursor-pointer"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 shrink-0">
          <button
            onClick={handleNewChat}
            className="w-full btn-brand-pill py-2.5 px-4 text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New chat</span>
          </button>
        </div>

        {/* Chat List Grouped by Date */}
        <div className="flex-1 overflow-y-auto px-3 space-y-4">
          {today.length > 0 && (
            <div>
              <div className="text-[11px] font-heading font-semibold uppercase tracking-wider text-slate-400 px-3 mb-1.5">
                Today
              </div>
              <div className="space-y-0.5">
                {today.map((chat) => renderChatItem(chat))}
              </div>
            </div>
          )}

          {yesterday.length > 0 && (
            <div>
              <div className="text-[11px] font-heading font-semibold uppercase tracking-wider text-slate-400 px-3 mb-1.5">
                Yesterday
              </div>
              <div className="space-y-0.5">
                {yesterday.map((chat) => renderChatItem(chat))}
              </div>
            </div>
          )}

          {earlier.length > 0 && (
            <div>
              <div className="text-[11px] font-heading font-semibold uppercase tracking-wider text-slate-400 px-3 mb-1.5">
                Earlier
              </div>
              <div className="space-y-0.5">
                {earlier.map((chat) => renderChatItem(chat))}
              </div>
            </div>
          )}

          {chats.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400">
              No conversations yet
            </div>
          )}
        </div>

        {/* Bottom Section: Memory & User Card */}
        <div className="p-3 border-t border-white/10 space-y-2.5 shrink-0 bg-[#0B1530]">
          {/* Collapsible "What I remember" */}
          <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
            <button
              onClick={() => setMemoryOpen(!memoryOpen)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-[#F5A623]" />
                <span>What I remember</span>
                {studentFacts.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#1E4FF7]/30 text-[#93C5FD]">
                    {studentFacts.length}
                  </span>
                )}
              </div>
              {memoryOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {memoryOpen && (
              <div className="px-3 pb-3 pt-1 border-t border-white/5 max-h-36 overflow-y-auto">
                {studentFacts.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">
                    Tell me what you find difficult or your study preferences, and I'll remember them!
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {studentFacts.map((fact, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 text-[11px] bg-white/10 text-slate-200 border border-white/15 px-2 py-0.5 rounded-full"
                      >
                        <span className="truncate max-w-[170px]">{fact}</span>
                        <button
                          onClick={() => handleDeleteFact(fact)}
                          className="hover:text-red-400 transition-colors cursor-pointer ml-0.5"
                          aria-label={`Remove fact ${fact}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User Profile Card */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#1E4FF7] to-[#F5A623] flex items-center justify-center font-heading font-bold text-xs text-white shrink-0">
                {userInitials}
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-white truncate">
                  {currentUser?.full_name || "Student"}
                </div>
                <span className="inline-block text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                  Student
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F7F8FC]">
        {/* Sticky Header */}
        <header className="h-16 px-4 sm:px-6 bg-white border-b border-[#E6E8F0] flex items-center justify-between shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 text-slate-600 hover:text-[#0F172A] rounded-lg cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="truncate">
              <h1 className="text-base font-heading font-bold text-[#0F172A] truncate">
                {activeChat ? activeChat.title : "New Conversation"}
              </h1>
              <p className="text-xs text-[#64748B] hidden sm:block">
                NCERT Class 11 · Answers backed strictly by official curriculum
              </p>
            </div>
          </div>

          {/* Enrolled Subject Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 pl-2 scrollbar-none">
            <button
              onClick={() => setSelectedSubjectId(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                selectedSubjectId === null
                  ? "bg-[#1E4FF7] text-white shadow-xs"
                  : "bg-slate-100 text-[#64748B] hover:bg-slate-200 border border-slate-200"
              }`}
            >
              All Subjects
            </button>
            {allowedSubjects.map((sub) => {
              const theme = getSubjectTheme(sub.name);
              const isSelected = selectedSubjectId === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setSelectedSubjectId(isSelected ? null : sub.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? "text-white shadow-xs"
                      : "border hover:opacity-80"
                  }`}
                  style={{
                    backgroundColor: isSelected ? theme.color : theme.bgSoft,
                    color: isSelected ? "#FFFFFF" : theme.color,
                    borderColor: theme.border,
                  }}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        </header>

        {/* Message Feed / Empty State */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 scroll-smooth">
          <div className="max-w-[820px] mx-auto space-y-6">
            {loadingMessages ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-[#1E4FF7]" />
                <span className="text-xs">Loading conversation...</span>
              </div>
            ) : messages.length === 0 ? (
              /* EMPTY STATE */
              <div className="py-10 sm:py-16 text-center animate-fadeIn">
                <div className="w-14 h-14 rounded-2xl bg-brand-gradient flex items-center justify-center mx-auto mb-5 text-white shadow-md">
                  <Sparkles className="w-7 h-7 text-white fill-white/20" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-heading font-extrabold text-[#0F172A] tracking-tight mb-2.5">
                  Hi {studentFirstName}, what are we learning today?
                </h2>
                <p className="text-sm text-[#64748B] max-w-md mx-auto mb-10 leading-relaxed">
                  Ask any question from your enrolled textbooks. Every response cites exact chapters, pages, and figures.
                </p>

                {/* 2x2 Suggested Question Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left max-w-xl mx-auto">
                  {suggestedCards.map((card, i) => {
                    const theme = getSubjectTheme(card.subject);
                    return (
                      <button
                        key={i}
                        onClick={() => handleAsk(undefined, card.question)}
                        className="group p-4 rounded-2xl bg-white border border-[#E6E8F0] card-shadow card-shadow-hover transition-all text-left flex flex-col justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2 mb-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0"
                            style={{
                              backgroundColor: theme.bgSoft,
                              color: theme.color,
                            }}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                          </div>
                          <span
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                            style={{
                              backgroundColor: theme.bgSoft,
                              color: theme.color,
                              borderColor: theme.border,
                            }}
                          >
                            {card.chapter}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-[#0F172A] group-hover:text-[#1E4FF7] transition-colors leading-snug">
                          {card.question}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* MESSAGE LIST */
              messages.map((msg) => (
                <div key={msg.id} className="animate-fadeIn">
                  {msg.role === "user" ? (
                    /* USER BUBBLE */
                    <div className="flex justify-end">
                      <div className="max-w-[85%] sm:max-w-[75%] px-5 py-3 rounded-2xl rounded-br-sm bg-[#1E4FF7] text-white text-sm shadow-xs leading-relaxed font-sans">
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    /* ASSISTANT MESSAGE CARD */
                    <div className="flex gap-3 sm:gap-4 items-start group">
                      <div className="w-8 h-8 rounded-xl bg-brand-gradient flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
                        <Sparkles className="w-4 h-4 fill-white/20" />
                      </div>

                      <div className="flex-1 bg-white border border-[#E6E8F0] rounded-2xl card-shadow p-5 sm:p-7 relative overflow-hidden">
                        {/* Copy Button on Hover */}
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Copy answer"
                          aria-label="Copy answer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        {/* REFUSAL CARD */}
                        {msg.refusal ? (
                          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
                            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-semibold text-amber-950 mb-0.5">
                                Not covered in your syllabus
                              </div>
                              <p className="text-amber-800 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                        ) : msg.isError ? (
                          /* ERROR CARD */
                          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium text-xs sm:text-sm">{msg.content}</p>
                              <button
                                onClick={() => handleAsk(undefined, msg.userQuestion)}
                                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Try again
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ANSWER TEXT WITH FORMATTED CITATIONS */
                          <>
                            {msg.content ? (
                              <FormattedMessageContent content={msg.content} />
                            ) : msg.isStreaming ? (
                              /* STEP LOADING STATE */
                              <div className="space-y-3 py-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-[#1E4FF7]">
                                  <span className="w-2 h-2 rounded-full bg-[#1E4FF7] animate-ping" />
                                  <span>
                                    {loadingStep === 0
                                      ? "Searching your NCERT textbooks…"
                                      : loadingStep === 1
                                      ? "Reading relevant pages & diagrams…"
                                      : "Writing comprehensive answer…"}
                                  </span>
                                </div>
                                <div className="space-y-2 pt-1 animate-pulse">
                                  <div className="h-3.5 bg-slate-100 rounded-md w-3/4" />
                                  <div className="h-3.5 bg-slate-100 rounded-md w-full" />
                                  <div className="h-3.5 bg-slate-100 rounded-md w-5/6" />
                                </div>
                              </div>
                            ) : null}

                            {/* BLINKING CARET DURING STREAMING */}
                            {msg.isStreaming && msg.content && (
                              <span className="inline-block w-1.5 h-4 ml-1 bg-[#1E4FF7] animate-pulse align-middle" />
                            )}

                            {/* CUTOFF REGENERATE BUTTON */}
                            {msg.cutoff && (
                              <div className="mt-4 pt-3 border-t border-[#E6E8F0]">
                                <button
                                  onClick={() =>
                                    handleAsk(
                                      undefined,
                                      `Please continue from where you left off for: ${msg.userQuestion}`
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer shadow-xs"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Answer was cut off — regenerate</span>
                                </button>
                              </div>
                            )}

                            {/* SOURCES SECTION */}
                            {msg.sources && msg.sources.length > 0 && (
                              <div className="mt-6 pt-4 border-t border-[#E6E8F0]">
                                <div className="text-[11px] font-heading font-bold text-[#64748B] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>Sources</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {msg.sources.map((src, idx) => {
                                    const theme = getSubjectTheme(src.subject || src.book);
                                    const pageList =
                                      src.pages.length > 1
                                        ? `pp. ${src.pages.join(", ")}`
                                        : `p. ${src.pages[0]}`;
                                    return (
                                      <div
                                        key={idx}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-xs"
                                        style={{
                                          backgroundColor: theme.bgSoft,
                                          color: theme.color,
                                          borderColor: theme.border,
                                        }}
                                      >
                                        <BookOpen className="w-3 h-3 shrink-0" />
                                        <span>
                                          {src.book}
                                          {src.part ? ` ${src.part}` : ""} · Ch {src.chapterNumber} · {pageList}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* FIGURES FROM YOUR TEXTBOOK */}
                            {msg.images && msg.images.length > 0 && (
                              <div className="mt-6 pt-4 border-t border-[#E6E8F0]">
                                <div className="text-[11px] font-heading font-bold text-[#64748B] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-[#1E4FF7]" />
                                  <span>Figures from your textbook</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                  {msg.images.map((img, imgIdx) => (
                                    <div
                                      key={img.id}
                                      onClick={() => {
                                        const figList: LightboxFigure[] = msg.images!.map((im) => {
                                          const matchingSource =
                                            msg.sources?.find((s) => s.pages?.includes(im.pageNumber)) || msg.sources?.[0];
                                          return {
                                            id: im.id,
                                            url: im.url,
                                            thumbUrl: im.thumbUrl,
                                            bookTitle: matchingSource?.book,
                                            chapterNumber: matchingSource?.chapterNumber,
                                            chapterTitle: matchingSource?.chapterTitle,
                                            pageNumber: im.pageNumber,
                                            caption: im.caption,
                                          };
                                        });
                                        setActiveLightbox({ figures: figList, index: imgIdx });
                                      }}
                                      className="group/img rounded-xl border border-[#E6E8F0] card-shadow overflow-hidden bg-slate-50 cursor-pointer hover:border-[#1E4FF7]/50 transition-all"
                                    >
                                      <div className="h-28 overflow-hidden bg-white flex items-center justify-center p-2">
                                        <img
                                          src={img.thumbUrl || img.url}
                                          alt={img.caption || `Figure on page ${img.pageNumber}`}
                                          className="max-h-full max-w-full object-contain group-hover/img:scale-105 transition-transform duration-200"
                                          loading="lazy"
                                        />
                                      </div>
                                      <div className="p-2 text-center bg-slate-50 border-t border-[#E6E8F0]">
                                        <span className="text-[11px] font-semibold text-[#64748B]">
                                          Page {img.pageNumber}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* EXTRACTED TEXT EXCERPTS (Collapsed by default) */}
                            {msg.sections && msg.sections.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-[#E6E8F0]">
                                <button
                                  onClick={() => toggleSection(msg.id)}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
                                >
                                  {collapsedSections[msg.id] ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {collapsedSections[msg.id]
                                      ? "Hide textbook excerpt"
                                      : "Show textbook excerpt"}
                                  </span>
                                </button>

                                {collapsedSections[msg.id] && (
                                  <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-[#E6E8F0] space-y-3 text-xs text-slate-700 animate-fadeIn">
                                    {msg.sections.map((sec, idx) => (
                                      <div key={idx} className="space-y-1">
                                        <div className="font-semibold text-[#0F172A]">
                                          {sec.chapterTitle} — {sec.sectionTitle}
                                        </div>
                                        <p className="text-slate-600 leading-relaxed font-mono text-[11px] whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-slate-200">
                                          {sec.chunks.map((c) => c.content).join("\n\n")}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
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

        {/* FLOATING COMPOSER */}
        <div className="sticky bottom-0 pb-5 pt-2 px-4 sm:px-6 bg-gradient-to-t from-[#F7F8FC] via-[#F7F8FC]/90 to-transparent shrink-0">
          <div className="max-w-[820px] mx-auto">
            <div className="bg-white rounded-2xl border border-[#E6E8F0] card-shadow p-2.5 sm:p-3 flex items-end gap-2.5 transition-all focus-within:border-[#1E4FF7]/60 focus-within:ring-2 focus-within:ring-[#1E4FF7]/20">
              <textarea
                ref={textareaRef}
                rows={1}
                value={inputQuery}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask about any topic in your textbooks…"
                disabled={isStreaming}
                className="flex-1 max-h-[140px] resize-none border-0 bg-transparent text-sm text-[#0F172A] placeholder-[#94A3B8] focus:ring-0 focus:outline-none p-1.5 leading-relaxed"
              />
              <button
                onClick={() => handleAsk()}
                disabled={isStreaming || !inputQuery.trim()}
                className="w-9 h-9 rounded-full btn-brand-pill flex items-center justify-center shrink-0 shadow-sm disabled:opacity-40 cursor-pointer"
                aria-label="Send question"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </div>
            <div className="text-center mt-2">
              <p className="text-[11px] text-[#64748B]">
                Answers come only from your NCERT textbooks.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Helper to render chat items in sidebar
  function renderChatItem(chat: Chat) {
    const isActive = chat.id === activeChatId;
    const isRenaming = chat.id === renamingChatId;

    return (
      <div
        key={chat.id}
        onClick={() => {
          setActiveChatId(chat.id);
          if (window.innerWidth < 768) setSidebarOpen(false);
        }}
        className={`group relative flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
          isActive
            ? "bg-[#1E4FF7]/20 text-white border-l-[3px] border-[#1E4FF7]"
            : "text-slate-300 hover:bg-[#16224A] hover:text-white border-l-[3px] border-transparent"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-white" />
          {isRenaming ? (
            <input
              type="text"
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onBlur={() => handleSaveRename(chat.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename(chat.id);
                if (e.key === "Escape") setRenamingChatId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-[#0B1530] text-white px-1.5 py-0.5 rounded border border-[#1E4FF7] text-xs focus:outline-none"
            />
          ) : (
            <span className="truncate">{chat.title || "New Chat"}</span>
          )}
        </div>

        {/* Rename & Delete on hover */}
        {!isRenaming && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRenamingChatId(chat.id);
                setRenameTitle(chat.title);
              }}
              className="p-1 hover:text-[#60A5FA] rounded transition-colors"
              title="Rename"
              aria-label="Rename chat"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => handleDeleteChat(chat.id, e)}
              className="p-1 hover:text-red-400 rounded transition-colors"
              title="Delete"
              aria-label="Delete chat"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  }
}

export default function StudentDashboard() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F7F8FC] gap-5">
          <Logo variant="compact" size="lg" />
          <div className="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <StudentDashboardInner />
    </Suspense>
  );
}
