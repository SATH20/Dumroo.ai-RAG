/**
 * Evaluation script for Dumroo RAG pipeline against 18 benchmark questions
 * (10 in-book, 5 should-refuse, and 3 conversational follow-ups)
 * + 3x sentence completion check for "Explain Newton's second law".
 */

import fs from "fs";
import path from "path";
import { checkAnswerCompleteness } from "../web/lib/completeness";

// Load web/.env.local
const envPath = path.resolve("web/.env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

interface TestCase {
  id: number;
  question: string;
  type: "in-book" | "refusal" | "follow-up" | "topic-switch" | "personal";
  subject?: string;
  expectedChapter?: string;
  initialPrompt?: string; // For follow-up or topic-switch tests
  checkPass: (
    answered: boolean,
    sources: any[],
    topSim: number,
    fullText: string,
    extra?: any
  ) => { pass: boolean; reason: string };
}

// Replace legacy sentence check with strict 1a-1d check from web/lib/completeness
function checkCompleteSentence(text: string): { complete: boolean; reason: string } {
  return checkAnswerCompleteness(text);
}

const testCases: TestCase[] = [
  // 10 In-Book Cases
  {
    id: 1,
    question: "What is a set?",
    type: "in-book",
    subject: "Maths",
    expectedChapter: "Ch 1 (Sets)",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => (s.book?.toLowerCase().includes("math") || s.subject === "maths") && s.chapterNumber === 1
      );
      return { pass: answered && found, reason: found ? "Found Maths Ch 1" : "Missed Maths Ch 1" };
    },
  },
  {
    id: 2,
    question: "binomial theorem",
    type: "in-book",
    subject: "Maths",
    expectedChapter: "Ch 7 (Binomial Theorem)",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => (s.book?.toLowerCase().includes("math") || s.subject === "maths") && s.chapterNumber === 7
      );
      return { pass: answered && found, reason: found ? "Found Maths Ch 7" : "Missed Maths Ch 7" };
    },
  },
  {
    id: 3,
    question: "Newton's second law",
    type: "in-book",
    subject: "Physics",
    expectedChapter: "Part 1, Ch 4 (Laws of Motion)",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => s.book?.toLowerCase().includes("physics") && s.chapterNumber === 4 && (s.part === "Part 1" || !s.part)
      );
      return { pass: answered && found, reason: found ? "Found Physics Part 1, Ch 4" : "Missed Physics Ch 4" };
    },
  },
  {
    id: 4,
    question: "projectile motion",
    type: "in-book",
    subject: "Physics",
    expectedChapter: "Part 1, Ch 3 (Motion in a Plane)",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => s.book?.toLowerCase().includes("physics") && (s.chapterNumber === 3 || s.chapterNumber === 2)
      );
      return { pass: answered && found, reason: found ? "Found Physics Part 1" : "Missed Physics Part 1" };
    },
  },
  {
    id: 5,
    question: "mole concept",
    type: "in-book",
    subject: "Chemistry",
    expectedChapter: "Ch 1 (Some Basic Concepts)",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("chemistry") && s.chapterNumber === 1);
      return { pass: answered && found, reason: found ? "Found Chemistry Ch 1" : "Missed Chemistry Ch 1" };
    },
  },
  {
    id: 6,
    question: "hybridisation",
    type: "in-book",
    subject: "Chemistry",
    expectedChapter: "Ch 4 (Chemical Bonding)",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("chemistry") && s.chapterNumber === 4);
      return { pass: answered && found, reason: found ? "Found Chemistry Ch 4" : "Missed Chemistry Ch 4" };
    },
  },
  {
    id: 7,
    question: "photosynthesis",
    type: "in-book",
    subject: "Biology",
    expectedChapter: "Ch 11 (Photosynthesis)",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("biology") && s.chapterNumber === 11);
      return { pass: answered && found, reason: found ? "Found Biology Ch 11" : "Missed Biology Ch 11" };
    },
  },
  {
    id: 8,
    question: "cell cycle",
    type: "in-book",
    subject: "Biology",
    expectedChapter: "Ch 10 (Cell Cycle)",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("biology") && s.chapterNumber === 10);
      return { pass: answered && found, reason: found ? "Found Biology Ch 10" : "Missed Biology Ch 10" };
    },
  },
  {
    id: 9,
    question: "Genghis Khan and the Mongols",
    type: "in-book",
    subject: "History",
    expectedChapter: "Ch 5 (Nomadic Empires)",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.chapterNumber === 5 || s.chapterTitle?.toLowerCase().includes("nomadic"));
      return { pass: answered && found, reason: found ? "Found History Ch 5" : "Missed History Ch 5" };
    },
  },
  {
    id: 10,
    question: "Mesopotamian cities and writing",
    type: "in-book",
    subject: "History",
    expectedChapter: "Ch 2 (Writing and City Life)",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.chapterNumber === 2 || s.chapterTitle?.toLowerCase().includes("writing"));
      return { pass: answered && found, reason: found ? "Found History Ch 2" : "Missed History Ch 2" };
    },
  },

  // 5 Should-Refuse Cases
  {
    id: 11,
    question: "Who won the 2018 FIFA World Cup?",
    type: "refusal",
    expectedChapter: "Refusal",
    checkPass: (answered) => ({
      pass: !answered,
      reason: !answered ? "Refused" : "Failed: Answered out of curriculum",
    }),
  },
  {
    id: 12,
    question: "Write a Python function to sort a list",
    type: "refusal",
    expectedChapter: "Refusal",
    checkPass: (answered) => ({
      pass: !answered,
      reason: !answered ? "Refused" : "Failed: Answered out of curriculum",
    }),
  },
  {
    id: 13,
    question: "What is the capital of France?",
    type: "refusal",
    expectedChapter: "Refusal",
    checkPass: (answered) => ({
      pass: !answered,
      reason: !answered ? "Refused" : "Failed: Answered out of curriculum",
    }),
  },
  {
    id: 14,
    question: "Explain digestion in the human stomach",
    type: "refusal",
    expectedChapter: "Refusal",
    checkPass: (answered) => ({
      pass: !answered,
      reason: !answered ? "Refused" : "Failed: Did not refuse",
    }),
  },
  {
    id: 15,
    question: "How do I cook pasta?",
    type: "refusal",
    expectedChapter: "Refusal",
    checkPass: (answered) => ({
      pass: !answered,
      reason: !answered ? "Refused" : "Failed: Answered out of curriculum",
    }),
  },

  // 3 Conversational Follow-up Cases
  {
    id: 16,
    question: "give me an example",
    type: "follow-up",
    initialPrompt: "Newton's second law",
    expectedChapter: "Physics Part 1, Ch 4",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => s.book?.toLowerCase().includes("physics") && s.chapterNumber === 4 && (s.part === "Part 1" || !s.part)
      );
      return { pass: answered && found, reason: found ? "Found Physics Part 1 Ch 4" : "Missed Physics Ch 4" };
    },
  },
  {
    id: 17,
    question: "explain the light reaction in more detail",
    type: "follow-up",
    initialPrompt: "photosynthesis",
    expectedChapter: "Biology Ch 11",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("biology") && s.chapterNumber === 11);
      return { pass: answered && found, reason: found ? "Found Biology Ch 11" : "Missed Biology Ch 11" };
    },
  },
  {
    id: 18,
    question: "give me another example",
    type: "follow-up",
    initialPrompt: "What is a set?",
    expectedChapter: "Maths Ch 1",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => (s.book?.toLowerCase().includes("math") || s.subject === "maths") && s.chapterNumber === 1
      );
      return { pass: answered && found, reason: found ? "Found Maths Ch 1" : "Missed Maths Ch 1" };
    },
  },

  // 3 Topic-Switch Cases
  {
    id: 19,
    question: "how does photosynthesis work",
    type: "topic-switch",
    initialPrompt: "Newton's second law",
    expectedChapter: "Biology Ch 11",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("biology") && s.chapterNumber === 11);
      return { pass: answered && found, reason: found ? "Found Biology Ch 11" : "Missed Biology Ch 11" };
    },
  },
  {
    id: 20,
    question: "what is a set",
    type: "topic-switch",
    initialPrompt: "photosynthesis",
    expectedChapter: "Maths Ch 1",
    checkPass: (answered, sources) => {
      const found = sources.some(
        (s) => (s.book?.toLowerCase().includes("math") || s.subject === "maths") && s.chapterNumber === 1
      );
      return { pass: answered && found, reason: found ? "Found Maths Ch 1" : "Missed Maths Ch 1" };
    },
  },
  {
    id: 21,
    question: "explain hybridisation",
    type: "topic-switch",
    initialPrompt: "Genghis Khan and the Mongols",
    expectedChapter: "Chemistry Ch 4",
    checkPass: (answered, sources) => {
      const found = sources.some((s) => s.book?.toLowerCase().includes("chemistry") && s.chapterNumber === 4);
      return { pass: answered && found, reason: found ? "Found Chemistry Ch 4" : "Missed Chemistry Ch 4" };
    },
  },

  // 3 Intent Routing & Behavior Cases
  {
    id: 22,
    question: "I find integration hard",
    type: "personal",
    expectedChapter: "Friendly reply, memory=1, no sources",
    checkPass: (answered, sources, topSim, fullText, extra) => {
      const factsCount = extra?.facts?.length || 0;
      const noSources = sources.length === 0;
      const friendly =
        fullText.toLowerCase().includes("class 12") ||
        fullText.toLowerCase().includes("challenging") ||
        fullText.toLowerCase().includes("syllabus");
      const pass = answered && factsCount === 1 && noSources && friendly;
      return {
        pass,
        reason: pass
          ? `Friendly reply, memory=${factsCount}, sources=0`
          : `Failed: answered=${answered}, facts=${factsCount}, sources=${sources.length}`,
      };
    },
  },
  {
    id: 23,
    question: "what is integration",
    type: "refusal",
    expectedChapter: "Refusal, no sources",
    checkPass: (answered, sources) => {
      const pass = !answered && sources.length === 0;
      return {
        pass,
        reason: pass ? "Refused with 0 sources" : `Failed: answered=${answered}, sources=${sources.length}`,
      };
    },
  },
  {
    id: 24,
    question: "what is newton law",
    type: "in-book",
    subject: "Physics",
    expectedChapter: "Part 1, Ch 4 (Laws of Motion, no '[[')",
    checkPass: (answered, sources, topSim, fullText) => {
      const found = sources.some(
        (s) => s.book?.toLowerCase().includes("physics") && s.chapterNumber === 4 && (s.part === "Part 1" || !s.part)
      );
      const noMarker = !fullText.includes("[[");
      const pass = answered && found && noMarker;
      return {
        pass,
        reason: pass
          ? "Found Physics Part 1 Ch 4, no markers"
          : `Failed: found=${found}, noMarker=${noMarker}`,
      };
    },
  },
];

async function runEval() {
  const { runRagPipeline, DEFAULT_MIN_SIM } = await import("../web/lib/rag");
  const minSim = parseFloat(process.env.MIN_SIM || String(DEFAULT_MIN_SIM));

  console.log("=========================================================================================");
  console.log(`DUMROO RAG PIPELINE EVALUATION (24 QUESTIONS, MIN_SIM = ${minSim})`);
  console.log("=========================================================================================");

  const results: any[] = [];
  let passedCount = 0;

  for (const tc of testCases) {
    const startTime = Date.now();
    try {
      let history: any[] = [];

      let answered = false;
      let fullText = "";
      let modelUsed = "";
      let sources: any[] = [];
      let topSim = 0;
      let extra: any = {};

      if (tc.type === "personal") {
        const { getPersonalReply } = await import("../web/lib/intent");
        const { extractStudentFacts } = await import("../web/lib/memory");
        const reply = await getPersonalReply(tc.question);
        const facts = await extractStudentFacts(tc.question, []);
        answered = true;
        fullText = reply;
        sources = [];
        modelUsed = "intent-router";
        topSim = 0;
        extra = { facts };
      } else {
        // For follow-up or topic-switch test cases, seed the conversation with initial question
        if ((tc.type === "follow-up" || tc.type === "topic-switch") && tc.initialPrompt) {
          console.log(`\n  [Setup ${tc.type} ${tc.id}] Seeding conversation with: "${tc.initialPrompt}"...`);
          const initRes = await runRagPipeline({ question: tc.initialPrompt, minSim });
          let initText = "";
          if (initRes.stream) {
            for await (const evt of initRes.stream) {
              if (evt.type === "token") initText += evt.data.delta;
            }
          }
          history = [
            { role: "user", content: tc.initialPrompt },
            {
              role: "assistant",
              content: initText.slice(0, 600),
              chapterIds: initRes.metadata.sources.map((s) => s.chapterId),
              sources: initRes.metadata.sources,
            },
          ];
        }

        const res = await runRagPipeline({ question: tc.question, minSim, history });
        topSim = res.topSimilarity;
        modelUsed = res.metadata?.modelUsed || (res.refusal ? "none (min_sim)" : "");
        sources = res.metadata.sources || [];

        if (!res.refusal && res.stream) {
          for await (const evt of res.stream) {
            if (evt.type === "token") fullText += evt.data.delta;
            if (evt.type === "done") {
              answered = evt.data.answered;
              if (evt.data.modelUsed) modelUsed = evt.data.modelUsed;
            }
            if (evt.type === "refusal") {
              answered = false;
              sources = [];
            }
          }
        }
      }

      const elapsedMs = Date.now() - startTime;
      const { pass: basePass, reason: baseReason } = tc.checkPass(answered, sources, topSim, fullText, extra);
      let pass = basePass;
      let reason = baseReason;

      // Apply strict completeness check (rules 1a-1d) on any answered response
      if (answered && fullText.trim().length > 0) {
        const comp = checkAnswerCompleteness(fullText);
        if (!comp.complete) {
          pass = false;
          reason = `Failed completeness check: ${comp.reason}`;
        }
      }

      if (pass) passedCount++;

      const citedChapters = sources.map((s) => `${s.book} Ch ${s.chapterNumber}`).join(", ") || "None";

      results.push({
        id: tc.id,
        question:
          tc.type === "follow-up"
            ? `[Follow-up] ${tc.question}`
            : tc.type === "topic-switch"
            ? `[Switch] ${tc.question}`
            : tc.question,
        type: tc.type,
        expected: tc.expectedChapter,
        topSim: topSim.toFixed(4),
        model: modelUsed || "unknown",
        answered,
        citedChapters,
        time: `${(elapsedMs / 1000).toFixed(2)}s`,
        status: pass ? "PASS" : "FAIL",
        reason,
      });

      console.log(
        `[${tc.id}/24] ${pass ? "✓ PASS" : "✗ FAIL"} | "${tc.question}" | Sim: ${topSim.toFixed(
          4
        )} | Model: ${modelUsed} | Answered: ${answered} | ${elapsedMs}ms`
      );
      if (!pass) {
        console.log(`      -> Reason: ${reason}`);
      }
    } catch (err: any) {
      console.error(`Error on test ${tc.id} (${tc.question}):`, err);
      results.push({
        id: tc.id,
        question: tc.question,
        type: tc.type,
        expected: tc.expectedChapter,
        topSim: "0.0000",
        model: "ERROR",
        answered: false,
        citedChapters: "ERROR",
        time: "ERR",
        status: "FAIL",
        reason: err.message,
      });
    }
  }

  console.log("\n=========================================================================================");
  console.log("FINAL EVALUATION RESULTS TABLE");
  console.log("=========================================================================================");
  console.table(
    results.map((r) => ({
      "#": r.id,
      Question: r.question.length > 30 ? r.question.slice(0, 28) + "..." : r.question,
      Expected: r.expected,
      TopSim: r.topSim,
      Model: r.model,
      Answered: r.answered ? "YES" : "NO",
      Cited: r.citedChapters.length > 22 ? r.citedChapters.slice(0, 20) + "..." : r.citedChapters,
      Timing: r.time,
      Status: r.status,
    }))
  );

  console.log(`\nOverall Summary: ${passedCount} / 24 Passed (${((passedCount / 24) * 100).toFixed(1)}%)`);
  console.log(`Active MIN_SIM: ${minSim}`);
  console.log("=========================================================================================");

  // Comprehensive Sentence Completion Benchmark Suite
  console.log("\n=========================================================================================");
  console.log("STRICT SENTENCE & MATH COMPLETION BENCHMARK SUITE");
  console.log("=========================================================================================");

  const completionSuites = [
    { question: "Explain Newton's second law", trials: 5, label: "Newton's second law" },
    {
      question: "Derive the equations of motion for uniformly accelerated motion",
      trials: 3,
      label: "Equations of motion (derivation)",
    },
    {
      question: "Explain the quantum mechanical model of the atom",
      trials: 3,
      label: "Quantum mechanical model of atom",
    },
  ];

  interface CompletionTrialResult {
    suite: string;
    trial: number;
    question: string;
    finishReason: string;
    continuationRan: boolean;
    answerLength: number;
    last150: string;
    pass: boolean;
    reason: string;
  }

  const completionResults: CompletionTrialResult[] = [];

  for (const suite of completionSuites) {
    console.log(`\n--- Running ${suite.trials} trials: "${suite.question}" ---`);
    for (let t = 1; t <= suite.trials; t++) {
      const startTime = Date.now();
      const res = await runRagPipeline({ question: suite.question, minSim });
      let fullText = "";
      let isCutoff = false;
      let finishReason = "NONE";
      let continuationRan = false;
      let modelUsed = "";

      if (res.stream) {
        for await (const evt of res.stream) {
          if (evt.type === "token") fullText += evt.data.delta;
          if (evt.type === "done") {
            isCutoff = !!evt.data.cutoff;
            if (evt.data.finishReason) finishReason = evt.data.finishReason;
            if (evt.data.continuationRan) continuationRan = !!evt.data.continuationRan;
            if (evt.data.modelUsed) modelUsed = evt.data.modelUsed;
          }
        }
      }

      const elapsedMs = Date.now() - startTime;
      const comp = checkAnswerCompleteness(fullText);
      const pass = !isCutoff && comp.complete;
      const last150 = fullText.trim().slice(-150);

      completionResults.push({
        suite: suite.label,
        trial: t,
        question: suite.question,
        finishReason,
        continuationRan,
        answerLength: fullText.length,
        last150,
        pass,
        reason: comp.reason,
      });

      console.log(
        `Trial ${t}/${suite.trials} [${suite.label}]: ${pass ? "✓ PASS" : "✗ FAIL"} | Model: ${modelUsed} | Reason: ${finishReason} | ContRan: ${continuationRan} | Len: ${fullText.length} | ${elapsedMs}ms`
      );
      console.log(`  Last 150 chars: "${last150.replace(/\n/g, " ")}"`);
      if (!pass) {
        console.log(`  Failure Detail: ${comp.reason}`);
      }
    }
  }

  console.log("\n=========================================================================================");
  console.log("COMPLETION BENCHMARK SUMMARY TABLE");
  console.log("=========================================================================================");
  console.table(
    completionResults.map((r) => ({
      Suite: r.suite,
      Trial: r.trial,
      Status: r.pass ? "PASS" : "FAIL",
      FinishReason: r.finishReason,
      ContRan: r.continuationRan ? "YES" : "NO",
      Length: r.answerLength,
      Last150Snippet: r.last150.length > 50 ? "..." + r.last150.slice(-48).replace(/\n/g, " ") : r.last150.replace(/\n/g, " "),
      CompletenessReason: r.reason,
    }))
  );
}

runEval().catch(console.error);
