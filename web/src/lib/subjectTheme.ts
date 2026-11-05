export interface SubjectTheme {
  key: string;
  name: string;
  color: string;
  bgSoft: string;
  border: string;
  text: string;
  chipClass: string;
}

export const SUBJECT_THEMES: Record<string, SubjectTheme> = {
  physics: {
    key: "physics",
    name: "Physics",
    color: "#1E4FF7",
    bgSoft: "#EEF2FF",
    border: "#C7D2FE",
    text: "#1E4FF7",
    chipClass: "bg-[#EEF2FF] text-[#1E4FF7] border-[#C7D2FE]",
  },
  chemistry: {
    key: "chemistry",
    name: "Chemistry",
    color: "#7C3AED",
    bgSoft: "#F5F3FF",
    border: "#DDD6FE",
    text: "#7C3AED",
    chipClass: "bg-[#F5F3FF] text-[#7C3AED] border-[#DDD6FE]",
  },
  biology: {
    key: "biology",
    name: "Biology",
    color: "#16A34A",
    bgSoft: "#F0FDF4",
    border: "#BBF7D0",
    text: "#16A34A",
    chipClass: "bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]",
  },
  maths: {
    key: "maths",
    name: "Maths",
    color: "#F5A623",
    bgSoft: "#FFF4E0",
    border: "#FDE68A",
    text: "#B45309",
    chipClass: "bg-[#FFF4E0] text-[#B45309] border-[#FDE68A]",
  },
  mathematics: {
    key: "maths",
    name: "Maths",
    color: "#F5A623",
    bgSoft: "#FFF4E0",
    border: "#FDE68A",
    text: "#B45309",
    chipClass: "bg-[#FFF4E0] text-[#B45309] border-[#FDE68A]",
  },
  history: {
    key: "history",
    name: "History",
    color: "#E11D48",
    bgSoft: "#FFF1F2",
    border: "#FECDD3",
    text: "#E11D48",
    chipClass: "bg-[#FFF1F2] text-[#E11D48] border-[#FECDD3]",
  },
};

export const SUBJECT_ORDER = ["physics", "chemistry", "biology", "maths", "history"] as const;

export function getSubjectTheme(subjectNameOrBook?: string | null): SubjectTheme {
  if (!subjectNameOrBook) return SUBJECT_THEMES.physics;
  const lower = subjectNameOrBook.toLowerCase();
  if (lower.includes("phys")) return SUBJECT_THEMES.physics;
  if (lower.includes("chem")) return SUBJECT_THEMES.chemistry;
  if (lower.includes("bio")) return SUBJECT_THEMES.biology;
  if (lower.includes("math")) return SUBJECT_THEMES.maths;
  if (lower.includes("hist") || lower.includes("world")) return SUBJECT_THEMES.history;
  return SUBJECT_THEMES.physics;
}
