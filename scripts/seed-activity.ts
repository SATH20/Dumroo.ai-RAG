/**
 * scripts/seed-activity.ts
 * Inserts ~150 realistic query_logs rows over the last 14 days across the 5 demo students.
 * Strictly uses only each student's enrolled subjects, plausible textbook questions per chapter,
 * and includes ~15-20 not-covered / refused questions.
 * Sets is_demo = true.
 */

import fs from "fs";
import path from "path";

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

interface ChapterInfo {
  id: string;
  chapterNumber: number;
  chapterTitle: string;
  bookId: string;
  subjectId: string;
  subjectName: string;
}

// Plausible questions bank per subject & chapter topic keywords
const CURRICULUM_QUESTIONS: Record<string, Array<{ keywords: string[]; questions: string[] }>> = {
  physics: [
    {
      keywords: ["motion", "plane", "projectile"],
      questions: [
        "Explain projectile motion and derive the formula for maximum height",
        "What is the range of a projectile fired at angle theta?",
        "Explain uniform circular motion and centripetal acceleration",
        "Derivation of trajectory equation for a projectile",
      ],
    },
    {
      keywords: ["laws of motion", "newton"],
      questions: [
        "Explain Newton's second law with momentum derivative",
        "What is the difference between static, limiting, and kinetic friction?",
        "State and prove law of conservation of linear momentum with recoil example",
        "Explain inertial frame of reference versus non-inertial frame",
      ],
    },
    {
      keywords: ["work", "energy", "power"],
      questions: [
        "State and prove the work-energy theorem for a variable force",
        "Explain conservative versus non-conservative forces",
        "Derive potential energy stored in a compressed spring",
        "Collision in one dimension: elastic vs inelastic collision",
      ],
    },
    {
      keywords: ["rotational", "particles", "system"],
      questions: [
        "Define center of mass of a two-particle system",
        "What is torque and angular momentum relation dl/dt = tau?",
        "State the parallel and perpendicular axis theorems for moment of inertia",
        "Kinetic energy of a rolling body without slipping",
      ],
    },
    {
      keywords: ["gravitation"],
      questions: [
        "State Kepler's three laws of planetary motion",
        "Derive acceleration due to gravity variation with altitude and depth",
        "Calculate escape velocity from the surface of Earth",
        "Gravitational potential energy of two masses",
      ],
    },
    {
      keywords: ["solids", "mechanical"],
      questions: [
        "State Hooke's law and explain stress-strain curve for metallic wire",
        "Define Young's modulus, shear modulus, and bulk modulus",
        "Why are steel girders designed with I-shaped cross section?",
      ],
    },
    {
      keywords: ["fluids"],
      questions: [
        "State Pascal's law and hydraulic lift working principle",
        "Derive Bernoulli's equation for steady, non-viscous fluid flow",
        "Explain terminal velocity of a spherical body falling through viscous medium",
        "Surface tension and capillary rise derivation",
      ],
    },
    {
      keywords: ["thermodynamics"],
      questions: [
        "State First Law of Thermodynamics and sign conventions for heat and work",
        "Differentiate between isothermal and adiabatic expansion processes",
        "What is Carnot heat engine efficiency and Second Law of Thermodynamics?",
      ],
    },
    {
      keywords: ["oscillations"],
      questions: [
        "Simple harmonic motion displacement, velocity, and acceleration equations",
        "Derive time period of a simple pendulum in small oscillations",
        "Total energy of a simple harmonic oscillator conservation",
      ],
    },
    {
      keywords: ["waves"],
      questions: [
        "Difference between transverse and longitudinal waves with speed of sound formula",
        "Explain Doppler effect for sound moving source and stationary observer",
        "Superposition principle and standing waves in open vs closed organ pipes",
      ],
    },
  ],
  chemistry: [
    {
      keywords: ["basic concepts", "mole"],
      questions: [
        "Define the mole concept, molar mass, and Avogadro constant",
        "How do you determine empirical and molecular formulas from percentage composition?",
        "Stoichiometry calculation: limiting reagent and theoretical yield",
      ],
    },
    {
      keywords: ["atom", "structure"],
      questions: [
        "Postulates of Bohr's atomic model and energy levels of hydrogen",
        "Explain de Broglie wavelength and Heisenberg uncertainty principle",
        "Significance of quantum numbers n, l, m, s and Pauli exclusion principle",
        "Hund's rule of maximum multiplicity and Aufbau principle",
      ],
    },
    {
      keywords: ["classification", "periodicity", "elements"],
      questions: [
        "Periodic trends in atomic radius, ionic radius, and electronegativity",
        "Explain first and second ionization enthalpy trends across Period 3",
        "Electron gain enthalpy of halogens and noble gases comparison",
      ],
    },
    {
      keywords: ["bonding", "molecular", "hybridisation"],
      questions: [
        "Explain sp, sp2, and sp3 hybridisation with methane, ethene, and ethyne",
        "VSEPR theory rules for predicting geometry of NH3, H2O, and SF6",
        "Molecular orbital theory bond order of N2 and O2 molecules",
        "Hydrogen bonding types: intermolecular vs intramolecular",
      ],
    },
    {
      keywords: ["thermodynamics"],
      questions: [
        "State Hess's law of constant heat summation with standard enthalpy of formation",
        "Explain spontaneity of a reaction using Gibbs free energy change delta G",
        "Entropy and Second Law of Thermodynamics criteria for spontaneous change",
      ],
    },
    {
      keywords: ["equilibrium"],
      questions: [
        "State Le Chatelier's principle and effect of pressure on ammonia synthesis",
        "Relation between equilibrium constants Kp and Kc",
        "Calculate pH of a buffer solution using Henderson-Hasselbalch equation",
        "Solubility product Ksp and common ion effect explanation",
      ],
    },
    {
      keywords: ["redox"],
      questions: [
        "Rules for assigning oxidation numbers in complex ions",
        "Balance redox reaction in acidic medium using ion-electron method",
        "Standard electrode potential and electrochemical series applications",
      ],
    },
    {
      keywords: ["organic", "hydrocarbons"],
      questions: [
        "IUPAC nomenclature of branched alkanes, alkenes, and functional groups",
        "Markovnikov's addition rule and peroxide anti-Markovnikov effect",
        "Electrophilic aromatic substitution mechanism in benzene nitration",
        "Conformations of ethane: staggered and eclipsed projection",
      ],
    },
  ],
  biology: [
    {
      keywords: ["living world", "biological classification"],
      questions: [
        "Five kingdom system of classification proposed by R.H. Whittaker",
        "Characteristics of kingdom Monera, Protista, and Fungi",
        "Structure of virus and difference between virion and viroid",
      ],
    },
    {
      keywords: ["plant kingdom"],
      questions: [
        "Distinguishing features of Bryophytes, Pteridophytes, and Gymnosperms",
        "Alternation of generations: haplontic vs diplontic life cycles",
        "Economic importance of algae and classification into chlorophyceae, phaeophyceae",
      ],
    },
    {
      keywords: ["cell", "unit of life"],
      questions: [
        "Fluid mosaic model of plasma membrane by Singer and Nicolson",
        "Differences between prokaryotic and eukaryotic cellular structures",
        "Structure and function of mitochondria, chloroplast, and Golgi apparatus",
      ],
    },
    {
      keywords: ["cell cycle", "cell division"],
      questions: [
        "Stages of mitosis: prophase, metaphase, anaphase, telophase events",
        "Significance of crossing over during pachytene stage of meiosis I",
        "Differences between mitosis and meiosis division",
      ],
    },
    {
      keywords: ["photosynthesis"],
      questions: [
        "Light dependent reaction: cyclic vs non-cyclic photophosphorylation (Z-scheme)",
        "Calvin cycle (C3 pathway) enzymatic steps in stroma",
        "Hatch-Slack pathway (C4 cycle) and Kranz anatomy of leaves",
        "Factors affecting photosynthesis: Blackman's law of limiting factors",
      ],
    },
    {
      keywords: ["respiration in plants"],
      questions: [
        "Glycolysis pathway reactions and ATP yield in cytoplasm",
        "Tricarboxylic acid cycle (Krebs cycle) steps in mitochondrial matrix",
        "Electron transport system (ETS) and oxidative phosphorylation mechanism",
      ],
    },
    {
      keywords: ["plant growth", "development"],
      questions: [
        "Physiological effects of plant hormones: auxins, gibberellins, and cytokinins",
        "Role of abscisic acid (ABA) as stress hormone in plants",
        "Photoperiodism and vernalisation in flowering plants",
      ],
    },
  ],
  mathematics: [
    {
      keywords: ["sets"],
      questions: [
        "What is a set and difference between empty, finite, and infinite sets?",
        "Explain subsets, power set, and universal set with examples",
        "Venn diagram representation of union, intersection, and set difference",
        "De Morgan's laws verification using set theory",
      ],
    },
    {
      keywords: ["relations", "functions"],
      questions: [
        "Cartesian product of sets and definition of a relation",
        "Domain, co-domain, and range of real functions: polynomial, modulus, signum",
        "Greatest integer function properties and graph",
      ],
    },
    {
      keywords: ["trigonometric"],
      questions: [
        "Trigonometric values for allied angles in all four quadrants",
        "Prove addition formulas for sin(A+B) and cos(A+B)",
        "General solutions of trigonometric equations sin x = sin y",
      ],
    },
    {
      keywords: ["complex numbers", "quadratic"],
      questions: [
        "Algebra of complex numbers: modulus, conjugate, and argand plane representation",
        "Polar form representation of complex numbers z = r(cos theta + i sin theta)",
        "Solving quadratic equations with negative discriminant in complex domain",
      ],
    },
    {
      keywords: ["linear inequalities"],
      questions: [
        "Solving linear inequalities in one variable and number line representation",
        "Graphical solution of system of linear inequalities in two variables",
      ],
    },
    {
      keywords: ["permutations", "combinations"],
      questions: [
        "Fundamental principle of counting: multiplication and addition rules",
        "Derivation of nPr and nCr formulas and practical differences",
        "Arranging letters with identical characters using permutations",
      ],
    },
    {
      keywords: ["binomial theorem"],
      questions: [
        "State and prove Binomial Theorem for positive integral index",
        "Find general term and middle term in the expansion of (x + a)^n",
        "Applications of binomial theorem for approximations",
      ],
    },
    {
      keywords: ["sequences", "series"],
      questions: [
        "Arithmetic progression: nth term and sum of first n terms formula",
        "Geometric progression: common ratio, nth term, and sum of infinite GP",
        "Arithmetic mean and Geometric mean relation between two positive numbers",
      ],
    },
    {
      keywords: ["straight lines"],
      questions: [
        "Slope of a line and angle between two intersecting lines",
        "Various forms of equations of a line: slope-intercept, intercept, normal form",
        "Distance of a point from a given line and distance between parallel lines",
      ],
    },
    {
      keywords: ["conic sections"],
      questions: [
        "Standard equation of circle with center (h,k) and radius r",
        "Standard equations and properties of parabola with focus and directrix",
        "Eccentricity, foci, and vertices of ellipse and hyperbola",
      ],
    },
    {
      keywords: ["limits", "derivatives"],
      questions: [
        "Intuitive concept of limit and standard limit lim (sin x / x) as x -> 0",
        "Derivative from first principles for polynomial and trigonometric functions",
        "Product rule and quotient rule for finding derivatives",
      ],
    },
  ],
  history: [
    {
      keywords: ["writing", "city life", "mesopotamia"],
      questions: [
        "Growth of cities and urbanization in ancient Mesopotamia",
        "The cuneiform script and use of clay tablets for record keeping",
        "Urban layout of Ur and the significance of temples in Mesopotamian society",
      ],
    },
    {
      keywords: ["roman empire", "empire across three continents"],
      questions: [
        "The political structure of the early Roman Empire: Emperor, Senate, and Army",
        "Slavery and economic management in the Roman Empire",
        "Third century crisis in Rome and decentralization of power",
      ],
    },
    {
      keywords: ["nomadic empires", "genghis khan", "mongols"],
      questions: [
        "Genghis Khan's social and military reorganization of the Mongol confederation",
        "The Yam postal courier communication system across the Mongol Empire",
        "Significance of the Yasa legal code under Mongol rule",
      ],
    },
    {
      keywords: ["three orders", "feudalism"],
      questions: [
        "The Three Orders of medieval European society: clergy, nobility, and peasantry",
        "Feudal relationships: lord-vassal system and the manor house economy",
        "The crisis of the fourteenth century: famine, plague, and labor unrest in Europe",
      ],
    },
    {
      keywords: ["changing cultural traditions", "renaissance"],
      questions: [
        "The rise of Humanism in Italian universities and critique of medieval scholasticism",
        "Scientific discoveries by Copernicus and Galileo challenging the geocentric model",
        "Impact of the printing press on the spread of ideas and the Protestant Reformation",
      ],
    },
    {
      keywords: ["displacing indigenous peoples"],
      questions: [
        "Comparison of European settler policies in North America and Australia",
        "Impact of European colonization and the Gold Rush on Native American tribes",
      ],
    },
    {
      keywords: ["paths to modernization", "east asia"],
      questions: [
        "Meiji Restoration in Japan and the transition from feudalism to industrial power",
        "The Opium Wars and unequal treaties imposed on Qing Dynasty China",
        "Sun Yat-sen's Three Principles of the People and the 1911 Chinese Revolution",
      ],
    },
  ],
};

// Refused / Not-Covered questions bank (general, pop-culture, off-syllabus)
const NOT_COVERED_QUESTIONS = [
  "How do I cook pasta with garlic and olive oil?",
  "Who won the 2018 FIFA World Cup final?",
  "Write a Python script to sort a dictionary by its values",
  "What is the capital city of France?",
  "Explain digestion of proteins in the human stomach",
  "How do I change a flat tire on a Honda Civic?",
  "What is the formula for integration by parts in Class 12 mathematics?",
  "Aldol condensation reaction mechanism in advanced organic chemistry",
  "How does Bitcoin blockchain mining consensus work?",
  "What is the best opening strategy for white in chess?",
  "Recipe for baking soft chocolate chip cookies",
  "Detailed summary of Harry Potter and the Chamber of Secrets",
  "How do electric car lithium-ion batteries compare with solid-state batteries?",
  "What is the current population of Tokyo?",
  "Who directed the movie Inception?",
  "Explain the rule of offside in association football",
  "How to build a basic mobile app using Flutter",
  "What are the symptoms and treatments for seasonal allergies?",
];

async function seedActivity() {
  const { supabaseServer } = await import("../web/lib/supabase");

  console.log("=== SEEDING REALISTIC STUDENT QUERY LOG ACTIVITY (TASK D) ===");

  // 1. Fetch Students
  const { data: students, error: studErr } = await supabaseServer
    .from("profiles")
    .select("id, full_name")
    .eq("role", "student");

  if (studErr || !students || students.length === 0) {
    console.error("No student profiles found. Run `npm run seed` first!", studErr);
    return;
  }
  console.log(`Found ${students.length} students.`);

  // 2. Fetch Group Memberships & Subjects
  const { data: members, error: memErr } = await supabaseServer
    .from("group_members")
    .select("student_id, group_id, groups:group_id (id, name, subject_id, subjects:subject_id (id, name))");

  if (memErr) {
    console.error("Error fetching group members:", memErr);
    return;
  }

  const studentSubjectsMap = new Map<string, Array<{ id: string; name: string }>>();
  for (const m of (members as any[]) || []) {
    const sId = m.student_id;
    const subj = m.groups?.subjects;
    if (sId && subj) {
      const list = studentSubjectsMap.get(sId) || [];
      if (!list.some((s) => s.id === subj.id)) {
        list.push({ id: subj.id, name: subj.name.toLowerCase() });
      }
      studentSubjectsMap.set(sId, list);
    }
  }

  // 3. Fetch all Chapters & Books
  const { data: chaptersData, error: chapErr } = await supabaseServer
    .from("chapters")
    .select("id, number, title, book_id, books:book_id (id, title, part, subject_id, subjects:subject_id (name))");

  if (chapErr || !chaptersData) {
    console.error("Error fetching chapters:", chapErr);
    return;
  }

  const chaptersBySubject = new Map<string, ChapterInfo[]>();
  for (const c of chaptersData as any[]) {
    const subjName = c.books?.subjects?.name?.toLowerCase() || "";
    const subjId = c.books?.subject_id || "";
    if (subjName && subjId) {
      const list = chaptersBySubject.get(subjName) || [];
      list.push({
        id: c.id,
        chapterNumber: c.number,
        chapterTitle: c.title,
        bookId: c.book_id,
        subjectId: subjId,
        subjectName: subjName,
      });
      chaptersBySubject.set(subjName, list);
    }
  }

  console.log(`Indexed chapters across subjects:`, Array.from(chaptersBySubject.keys()));

  // 4. Generate ~150 Rows
  // 5 students * 30 questions = 150 rows
  const rowsToInsert: any[] = [];
  const NOW = Date.now();
  let notCoveredIdx = 0;

  for (const student of students) {
    const allowedSubjs = studentSubjectsMap.get(student.id) || [];
    if (allowedSubjs.length === 0) continue;

    console.log(`Generating 30 activity logs for student: ${student.full_name} (Subjects: ${allowedSubjs.map((s) => s.name).join(", ")})`);

    // 27 answered questions from allowed subjects + 3 not-covered questions = 30 queries per student
    for (let q = 0; q < 27; q++) {
      // Pick random allowed subject
      const randomSubj = allowedSubjs[Math.floor(Math.random() * allowedSubjs.length)];
      const normalizedSubject = randomSubj.name === "maths" ? "mathematics" : randomSubj.name;
      const subjKey = Object.keys(CURRICULUM_QUESTIONS).find((k) => normalizedSubject.includes(k)) || "physics";
      const subjChapters = chaptersBySubject.get(randomSubj.name) || chaptersBySubject.get("physics") || [];

      // Pick topic block
      const blocks = CURRICULUM_QUESTIONS[subjKey] || CURRICULUM_QUESTIONS["physics"];
      const block = blocks[Math.floor(Math.random() * blocks.length)];
      const questionText = block.questions[Math.floor(Math.random() * block.questions.length)];

      // Find matching chapter in database
      let matchedChap = subjChapters.find((ch) =>
        block.keywords.some((kw) => ch.chapterTitle.toLowerCase().includes(kw))
      );
      if (!matchedChap && subjChapters.length > 0) {
        matchedChap = subjChapters[Math.floor(Math.random() * subjChapters.length)];
      }

      // Random timestamp in last 14 days
      const daysAgo = Math.floor(Math.random() * 14);
      const hoursAgo = Math.floor(Math.random() * 24);
      const minutesAgo = Math.floor(Math.random() * 60);
      const timestamp = new Date(NOW - (daysAgo * 86400000 + hoursAgo * 3600000 + minutesAgo * 60000)).toISOString();

      // Top similarity 0.70 - 0.85
      const topSimilarity = parseFloat((0.71 + Math.random() * 0.12).toFixed(4));

      rowsToInsert.push({
        user_id: student.id,
        chat_id: null,
        subject_id: matchedChap ? matchedChap.subjectId : randomSubj.id,
        query: questionText,
        chapter_ids: matchedChap ? [matchedChap.id] : [],
        section_titles: matchedChap ? [`${matchedChap.chapterNumber}.1 Overview and Principles`] : [],
        answered: true,
        top_similarity: topSimilarity,
        is_demo: true,
        created_at: timestamp,
      });
    }

    // 3 Not-covered questions per student
    for (let n = 0; n < 3; n++) {
      const refusedQuery = NOT_COVERED_QUESTIONS[notCoveredIdx % NOT_COVERED_QUESTIONS.length];
      notCoveredIdx++;

      const daysAgo = Math.floor(Math.random() * 14);
      const hoursAgo = Math.floor(Math.random() * 24);
      const timestamp = new Date(NOW - (daysAgo * 86400000 + hoursAgo * 3600000)).toISOString();
      const topSimilarity = parseFloat((0.42 + Math.random() * 0.18).toFixed(4));

      rowsToInsert.push({
        user_id: student.id,
        chat_id: null,
        subject_id: null,
        query: refusedQuery,
        chapter_ids: [],
        section_titles: [],
        answered: false,
        top_similarity: topSimilarity,
        is_demo: true,
        created_at: timestamp,
      });
    }
  }

  console.log(`Total realistic activity rows generated: ${rowsToInsert.length}`);

  // Clean old demo rows first (idempotent)
  try {
    const { error: delErr } = await supabaseServer.from("query_logs").delete().eq("is_demo", true);
    if (delErr && !delErr.message?.includes("is_demo")) {
      console.warn("Delete old demo logs note:", delErr.message);
    }
  } catch {}

  // Insert in batches of 50
  for (let i = 0; i < rowsToInsert.length; i += 50) {
    const batch = rowsToInsert.slice(i, i + 50);
    const { error: insErr } = await supabaseServer.from("query_logs").insert(batch);
    if (insErr) {
      if (insErr.message?.includes("is_demo")) {
        console.warn("is_demo column not yet present in schema, inserting without is_demo...");
        const cleanBatch = batch.map(({ is_demo, ...rest }) => rest);
        const { error: fallbackErr } = await supabaseServer.from("query_logs").insert(cleanBatch);
        if (fallbackErr) {
          console.error(`Batch ${i / 50 + 1} insert failed:`, fallbackErr);
        } else {
          console.log(`Inserted batch ${i / 50 + 1} (${cleanBatch.length} rows) without is_demo.`);
        }
      } else {
        console.error(`Batch ${i / 50 + 1} insert failed:`, insErr);
      }
    } else {
      console.log(`Inserted batch ${i / 50 + 1} (${batch.length} rows with is_demo=true).`);
    }
  }

  console.log("=== REALISTIC ACTIVITY SEEDING COMPLETE ===");
}

seedActivity().catch(console.error);
