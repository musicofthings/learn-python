/**
 * Client-side dynamic generator — used when the API server is offline.
 * Produces shuffled quiz/flashcard/micro practice from embedded banks.
 */
const HelixGenerator = (() => {
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedNum(seed) {
    if (!seed) return (Math.random() * 2 ** 32) >>> 0;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function rng(seed) {
    const rand = mulberry32(seedNum(seed));
    return {
      random: rand,
      pick(arr) {
        return arr[Math.floor(rand() * arr.length)];
      },
      shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
    };
  }

  function shuffleChoices(r, choices, answer) {
    const order = r.shuffle(choices.map((_, i) => i));
    return {
      choices: order.map((i) => choices[i]),
      answer: order.indexOf(answer),
    };
  }

  const CODE_BANK = [
    {
      topic: "Python · SeqIO",
      question: "What does this snippet do?",
      code: "from Bio import SeqIO\nids = [r.id for r in SeqIO.parse('t.fa', 'fasta')]",
      choices: [
        "Collects FASTA record IDs from a multi-FASTA",
        "Translates every record to protein",
        "Writes a PDB file",
        "Computes Morgan fingerprints",
      ],
      answer: 0,
      explanation: "SeqIO.parse iterates SeqRecords; the list comp stores each record.id.",
    },
    {
      topic: "Python · RDKit None",
      question: "What happens for invalid SMILES here?",
      code: "from rdkit import Chem\nmol = Chem.MolFromSmiles('not_a_molecule')\nprint(mol)",
      choices: [
        "mol is None (print shows None)",
        "RDKit always raises SystemExit",
        "mol becomes an empty FASTA",
        "mol is the string 'not_a_molecule'",
      ],
      answer: 0,
      explanation: "MolFromSmiles returns None on parse failure — callers must null-check.",
    },
    {
      topic: "Python · pandas IC50",
      question: "What is the main effect of this line?",
      code: "df['IC50_nM'] = pd.to_numeric(df['IC50_nM'], errors='coerce')",
      choices: [
        "Coerces IC50 to numbers; bad values become NaN",
        "Converts IC50 to SMILES",
        "Sorts the dataframe by well",
        "Drops all rows silently without NaNs",
      ],
      answer: 0,
      explanation: "to_numeric with errors='coerce' is standard assay QC hygiene.",
    },
    {
      topic: "Python · scaffold leakage",
      question: "Why is this split unsafe for QSAR?",
      code: "train, test = train_test_split(df, test_size=0.2)",
      choices: [
        "It splits rows, so the same scaffold/compound can leak across sets",
        "test_size=0.2 is illegal in sklearn",
        "It converts SMILES to FASTA",
        "It requires GPU",
      ],
      answer: 0,
      explanation: "Use group/scaffold/time splits so analogues do not leak.",
    },
    {
      topic: "Python · pIC50",
      question: "What does this function return for 100 nM?",
      code: "import math\ndef pic50(ic50_nM):\n    return -math.log10(ic50_nM * 1e-9)",
      choices: ["About 7.0", "About 2.0", "About 100", "About -7.0"],
      answer: 0,
      explanation: "100 nM = 1e-7 M → -log10 = 7.",
    },
    {
      topic: "Python · NeighborSearch",
      question: "What is this pattern used for?",
      code: "ns = NeighborSearch(atoms)\nhits = ns.search(center, 4.5)",
      choices: [
        "Finding atoms within 4.5 Å of a point (e.g. ligand)",
        "Aligning FASTA sequences",
        "Parsing SMILES",
        "Training a GNN",
      ],
      answer: 0,
      explanation: "Bio.PDB.NeighborSearch performs spatial neighbor queries.",
    },
  ];

  function fromStaticBank(domain, n, seed) {
    const r = rng(seed);
    const pool = (typeof QUESTIONS !== "undefined" && QUESTIONS[domain]) || [];
    if (!pool.length) {
      // code-reading fallback
      return r.shuffle(CODE_BANK).slice(0, n).map((q) => {
        const s = shuffleChoices(r, q.choices, q.answer);
        return { ...q, ...s, source: "local" };
      });
    }
    return r.shuffle(pool).slice(0, n).map((q) => {
      const s = shuffleChoices(r, q.choices, q.answer);
      return {
        topic: q.topic,
        question: q.question,
        code: q.code,
        choices: s.choices,
        answer: s.answer,
        explanation: q.explanation,
        source: "local",
      };
    });
  }

  function quiz(domain, n = 10, seed) {
    const raw = fromStaticBank(domain, Math.max(n * 2, n), seed || String(Date.now()));
    const seen = new Set();
    const questions = [];
    for (const q of raw) {
      const k = (q.question || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      questions.push(q);
      if (questions.length >= n) break;
    }
    return {
      domain,
      source: "local",
      seed: seed || null,
      questions,
      warning: HelixAPI && HelixAPI.hasLiveKey && HelixAPI.hasLiveKey()
        ? undefined
        : "Local templates — add an OpenRouter key in AI settings for unique live questions.",
    };
  }

  function flashcards(domain, n = 12, seed) {
    const r = rng(seed || String(Date.now()));
    const pool = (typeof FLASHCARDS !== "undefined" && FLASHCARDS[domain]) || [];
    let cards;
    if (pool.length) {
      cards = r.shuffle(pool).slice(0, n).map((c) => ({ ...c, source: "local" }));
    } else {
      cards = quiz(domain, n, seed).questions.map((q) => ({
        topic: q.topic,
        front: q.question,
        back: `${q.choices[q.answer]}\n\n${q.explanation}`,
        source: "local",
      }));
    }
    return {
      domain,
      source: "local",
      cards,
      warning: "Generated in-browser (API offline). Start ./start.sh for AI generation.",
    };
  }

  function getTopic(topicId) {
    return (typeof MICRO_TOPICS !== "undefined" ? MICRO_TOPICS : []).find((t) => t.id === topicId);
  }

  function micro(topicId, nQuiz = 6, nCards = 8, seed) {
    const topic = getTopic(topicId);
    if (!topic) throw new Error("Unknown micro topic: " + topicId);
    const r = rng(seed || String(Date.now()));

    const bank = [];
    (topic.lesson || []).forEach((section) => {
      bank.push({
        topic: topic.name,
        question: `In ${topic.name}, why does "${section.heading}" matter in practice?`,
        choices: [
          `A core idea under "${section.heading}" is central to sound CompBio work in this topic.`,
          "It is only relevant for organic solvent colorimetry.",
          "It replaces the need for any experimental assay forever.",
          "It only changes FASTA header fonts.",
        ],
        answer: 0,
        explanation: section.body,
      });
    });
    (topic.code_examples || []).forEach((ex) => {
      bank.push({
        topic: `Code · ${ex.title}`,
        question: "What does this code do?",
        code: ex.code,
        choices: [
          ex.explain,
          "Uploads the notebook to NCBI Entrez automatically",
          "Converts all arrays to SMILES strings",
          "Trains a docking engine from scratch",
        ],
        answer: 0,
        explanation: ex.explain,
      });
    });
    if (topicId === "python-code-reading") bank.push(...CODE_BANK);

    const useBank = bank.length ? bank : CODE_BANK;
    const quizItems = [];
    for (let i = 0; i < nQuiz; i++) {
      const item = useBank[i % useBank.length];
      const s = shuffleChoices(r, item.choices, item.answer);
      const q = {
        topic: item.topic,
        question: item.question,
        choices: s.choices,
        answer: s.answer,
        explanation: item.explanation,
        source: "local",
      };
      if (item.code) q.code = item.code;
      quizItems.push(q);
    }

    let cards = [];
    (topic.lesson || []).forEach((section) => {
      cards.push({
        topic: section.heading,
        front: `${topic.name}: ${section.heading} — what's the idea?`,
        back: section.body,
        source: "local",
      });
    });
    (topic.code_examples || []).forEach((ex) => {
      cards.push({
        topic: ex.title,
        front: `What does this code do?\n\n${ex.code}`,
        back: ex.explain,
        source: "local",
      });
    });
    quizItems.forEach((q) => {
      cards.push({
        topic: q.topic,
        front: q.question + (q.code ? `\n\n${q.code}` : ""),
        back: `${q.choices[q.answer]}\n\n${q.explanation}`,
        source: "local",
      });
    });
    cards = r.shuffle(cards).slice(0, nCards);

    return {
      topic_id: topicId,
      topic,
      source: "local",
      quiz: quizItems,
      flashcards: cards,
      warning: "Generated in-browser (API offline). Start ./start.sh for AI generation.",
    };
  }

  return { quiz, flashcards, micro, getTopic };
})();
