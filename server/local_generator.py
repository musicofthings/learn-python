"""Deterministic-but-varied local generator used when no LLM key is configured."""

from __future__ import annotations

import hashlib
import random
from typing import Any

from server.micro_topics import MICRO_TOPICS, get_topic

DOMAIN_SEEDS: dict[str, list[dict[str, Any]]] = {
    "genomics": [
        {
            "topic": "BioPython · SeqIO",
            "templates": [
                {
                    "q": "Which call iterates every record in a multi-FASTA of {target} genes?",
                    "code": "from Bio import SeqIO",
                    "choices": [
                        "SeqIO.parse('genes.fasta', 'fasta')",
                        "SeqIO.read_all('genes.fasta')",
                        "SeqIO.load('genes.fasta')",
                        "open_fasta('genes.fasta').all()",
                    ],
                    "answer": 0,
                    "explanation": "SeqIO.parse yields SeqRecord objects for multi-record FASTA files.",
                }
            ],
            "vars": {"target": ["kinase", "GPCR", "ion-channel", "immuno-oncology"]},
        },
        {
            "topic": "Reference genomes",
            "templates": [
                {
                    "q": "Why must a {pipeline} pipeline pin GRCh38 instead of mixing builds?",
                    "choices": [
                        "Coordinates/annotations are build-specific; mixing breaks joins",
                        "Builds only change FASTA header fonts",
                        "NCBI forbids pinning assemblies",
                        "BioPython cannot read pinned builds",
                    ],
                    "answer": 0,
                    "explanation": "Variant and peak joins fail silently across assemblies without lift-over.",
                }
            ],
            "vars": {"pipeline": ["CRISPR off-target", "RNA-seq", "ChIP-seq", "GWAS fine-map"]},
        },
        {
            "topic": "Off-target search",
            "templates": [
                {
                    "q": "Best first step to triage {guide} off-targets genome-wide?",
                    "choices": [
                        "Approximate aligners / CRISPR off-target tools + mismatch ranking",
                        "Lipinski filters on the guide",
                        "Dock the guide into every PDB",
                        "Morgan fingerprints of the guide RNA",
                    ],
                    "answer": 0,
                    "explanation": "Off-target triage is genomic alignment/mismatch scoring, not small-molecule filters.",
                }
            ],
            "vars": {"guide": ["SpCas9", "Cas12a", "base-editor", "prime-editor"]},
        },
    ],
    "chemistry": [
        {
            "topic": "RDKit · molecules",
            "templates": [
                {
                    "q": "In a {task} notebook, which RDKit call parses SMILES?",
                    "code": "from rdkit import Chem",
                    "choices": [
                        "Chem.MolFromSmiles(smi)",
                        "Chem.ParseSMILES(smi)",
                        "Chem.ReadSmiles(smi)",
                        "Chem.SmilesToMol(smi)",
                    ],
                    "answer": 0,
                    "explanation": "MolFromSmiles is canonical and may return None on invalid input.",
                }
            ],
            "vars": {"task": ["HTS triage", "QSAR featurization", "PAINS filter", "library enum"]},
        },
        {
            "topic": "RDKit · fingerprints",
            "templates": [
                {
                    "q": "Default fingerprint family for Tanimoto NN search in a {set} collection?",
                    "choices": [
                        "Morgan / ECFP-like bit vectors",
                        "FASTA k-mers",
                        "PWM matrices",
                        "Raw SMILES edit distance only",
                    ],
                    "answer": 0,
                    "explanation": "Morgan/ECFP + Tanimoto is the ligand-based neighbor workhorse.",
                }
            ],
            "vars": {"set": ["corporate", "vendor", "fragment", "DNA-encoded"]},
        },
        {
            "topic": "ADMET filters",
            "templates": [
                {
                    "q": "Which property set underpins {rule}-style oral drug-likeness heuristics?",
                    "choices": [
                        "MW, LogP, HBD/HBA (often rotatable bonds/TPSA)",
                        "Melting point and color only",
                        "BLAST e-values",
                        "FASTA GC%",
                    ],
                    "answer": 0,
                    "explanation": "Ro5/Veber-like filters use physicochemical descriptors as heuristics.",
                }
            ],
            "vars": {"rule": ["Lipinski", "Veber", "lead-like", "fragment-like"]},
        },
    ],
    "molecular": [
        {
            "topic": "AlphaFold models",
            "templates": [
                {
                    "q": "Before docking into an AF model of a {target}, what must you check?",
                    "choices": [
                        "pLDDT/PAE confidence especially in loops/interfaces",
                        "Only the FASTA header aesthetics",
                        "Whether SMILES length exceeds 80",
                        "Entrez taxonomy color codes",
                    ],
                    "answer": 0,
                    "explanation": "Low-confidence regions mislead pocket geometry and docking.",
                }
            ],
            "vars": {"target": ["kinase", "protease", "nuclear receptor", "transporter"]},
        },
        {
            "topic": "Structures · PDB",
            "templates": [
                {
                    "q": "Which BioPython module parses {fmt} coordinate files for pocket work?",
                    "choices": [
                        "Bio.PDB",
                        "Bio.StructureIO",
                        "Bio.SeqIO with format='pdb'",
                        "Bio.Align.PDB",
                    ],
                    "answer": 0,
                    "explanation": "Bio.PDB (PDBParser/MMCIFParser) builds the structure hierarchy.",
                }
            ],
            "vars": {"fmt": ["PDB", "mmCIF", "PDB/mmCIF"]},
        },
    ],
    "biologics": [
        {
            "topic": "CDR annotation",
            "templates": [
                {
                    "q": "Why does {scheme} numbering matter for mAb engineering?",
                    "choices": [
                        "CDR boundaries depend on the numbering scheme",
                        "All schemes share identical CDR indices",
                        "Numbering only affects small-molecule SMILES",
                        "BioPython forbids antibody sequences",
                    ],
                    "answer": 0,
                    "explanation": "Kabat/IMGT/Chothia shift CDR definitions used in humanization and liability scans.",
                }
            ],
            "vars": {"scheme": ["IMGT", "Kabat", "Chothia", "AHo"]},
        },
        {
            "topic": "Developability",
            "templates": [
                {
                    "q": "How are {liability} liabilities typically flagged on antibody sequences?",
                    "choices": [
                        "Motif/rule scans (+ structure context when available)",
                        "Lipinski Ro5 on IgG SMILES",
                        "GC% of Fc DNA only",
                        "Docking Fc to metabolites",
                    ],
                    "answer": 0,
                    "explanation": "Sequence motifs drive early developability flags for biologics.",
                }
            ],
            "vars": {"liability": ["deamidation", "oxidation", "isomerization", "glycosylation"]},
        },
    ],
    "docking": [
        {
            "topic": "Docking post-processing",
            "templates": [
                {
                    "q": "After docking a {lib} library, scores alone are weak. What helps?",
                    "choices": [
                        "Pose clustering, IFPs, rescoring/ML, strain/clash filters",
                        "Alphabetical ligand sort only",
                        "Keeping only the worst pose",
                        "Converting poses to RNA-seq counts",
                    ],
                    "answer": 0,
                    "explanation": "Post-processing and consensus filters improve enrichment over raw score.",
                }
            ],
            "vars": {"lib": ["fragment", "lead-like", "covalent warhead", "DNA-encoded"]},
        },
        {
            "topic": "Protonation",
            "templates": [
                {
                    "q": "Why enumerate {state} states before docking at assay pH?",
                    "choices": [
                        "Wrong protomers/tautomers change H-bonds and ranking",
                        "Protonation never affects modern scorers",
                        "Bio.PDB docks protomers automatically",
                        "All ligands must be carbon-only graphs",
                    ],
                    "answer": 0,
                    "explanation": "pH-aware protomer/tautomer prep is standard structure-based hygiene.",
                }
            ],
            "vars": {"state": ["protomer", "tautomer", "protomer/tautomer"]},
        },
    ],
    "clinical": [
        {
            "topic": "Units · potency",
            "templates": [
                {
                    "q": "pIC50 = {pic50} corresponds to which IC50?",
                    "choices": [
                        "{ic50_label}",
                        "7 μM exactly",
                        "0.7 M",
                        "70 mM",
                    ],
                    "answer": 0,
                    "explanation": "pIC50 = -log10(IC50[M]).",
                    "pic50_choices": [
                        ("7.0", "100 nM (10^-7 M)"),
                        ("6.0", "1 μM (10^-6 M)"),
                        ("8.0", "10 nM (10^-8 M)"),
                        ("9.0", "1 nM (10^-9 M)"),
                    ],
                }
            ],
            "vars": {},
        },
        {
            "topic": "Train/test leakage",
            "templates": [
                {
                    "q": "A {model} gets 0.98 AUROC on a random ChEMBL split but fails prospectively. Likely cause?",
                    "choices": [
                        "Scaffold/analogue leakage inflating metrics",
                        "AUROC cannot be used for potency",
                        "RDKit fingerprints incompatible with NNs",
                        "Too much protein sequence included",
                    ],
                    "answer": 0,
                    "explanation": "Random splits leak near-duplicates; use scaffold or temporal splits.",
                }
            ],
            "vars": {"model": ["GNN", "random forest", "chemprop model", "SVM"]},
        },
    ],
}

CODE_READING_BANK = [
    {
        "topic": "Python · SeqIO",
        "question": "What does this snippet do?",
        "code": "from Bio import SeqIO\nids = [r.id for r in SeqIO.parse('t.fa', 'fasta')]",
        "choices": [
            "Collects FASTA record IDs from a multi-FASTA",
            "Translates every record to protein",
            "Writes a PDB file",
            "Computes Morgan fingerprints",
        ],
        "answer": 0,
        "explanation": "SeqIO.parse iterates SeqRecords; the list comp stores each record.id.",
    },
    {
        "topic": "Python · RDKit None",
        "question": "What happens for invalid SMILES here?",
        "code": "from rdkit import Chem\nmol = Chem.MolFromSmiles('not_a_molecule')\nprint(mol)",
        "choices": [
            "mol is None (print shows None)",
            "RDKit always raises SystemExit",
            "mol becomes an empty FASTA",
            "mol is the string 'not_a_molecule'",
        ],
        "answer": 0,
        "explanation": "MolFromSmiles returns None on parse failure — callers must null-check.",
    },
    {
        "topic": "Python · pandas IC50",
        "question": "What is the main effect of this line?",
        "code": "df['IC50_nM'] = pd.to_numeric(df['IC50_nM'], errors='coerce')",
        "choices": [
            "Coerces IC50 to numbers; bad values become NaN",
            "Converts IC50 to SMILES",
            "Sorts the dataframe by well",
            "Drops all rows silently without NaNs",
        ],
        "answer": 0,
        "explanation": "to_numeric with errors='coerce' is standard assay QC hygiene.",
    },
    {
        "topic": "Python · scaffold leakage",
        "question": "Why is this split unsafe for QSAR?",
        "code": "train, test = train_test_split(df, test_size=0.2)",
        "choices": [
            "It splits rows, so the same scaffold/compound can leak across sets",
            "test_size=0.2 is illegal in sklearn",
            "It converts SMILES to FASTA",
            "It requires GPU",
        ],
        "answer": 0,
        "explanation": "Use group/scaffold/time splits so analogues do not leak.",
    },
    {
        "topic": "Python · pIC50",
        "question": "What does this function return for 100 nM?",
        "code": "import math\ndef pic50(ic50_nM):\n    return -math.log10(ic50_nM * 1e-9)",
        "choices": [
            "About 7.0",
            "About 2.0",
            "About 100",
            "About -7.0",
        ],
        "answer": 0,
        "explanation": "100 nM = 1e-7 M → -log10 = 7.",
    },
    {
        "topic": "Python · NeighborSearch",
        "question": "What is this pattern used for?",
        "code": "ns = NeighborSearch(atoms)\nhits = ns.search(center, 4.5)",
        "choices": [
            "Finding atoms within 4.5 Å of a point (e.g. ligand)",
            "Aligning FASTA sequences",
            "Parsing SMILES",
            "Training a GNN",
        ],
        "answer": 0,
        "explanation": "Bio.PDB.NeighborSearch performs spatial neighbor queries.",
    },
]


def _rng(seed: str | None) -> random.Random:
    if not seed:
        seed = str(random.randint(0, 1_000_000_000))
    h = hashlib.sha256(seed.encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def _fill(template: str, mapping: dict[str, str]) -> str:
    out = template
    for k, v in mapping.items():
        out = out.replace("{" + k + "}", v)
    return out


def _shuffle_choices(rng: random.Random, choices: list[str], answer: int) -> tuple[list[str], int]:
    order = list(range(len(choices)))
    rng.shuffle(order)
    new_choices = [choices[i] for i in order]
    new_answer = order.index(answer)
    return new_choices, new_answer


def generate_quiz_local(domain: str, n: int = 10, seed: str | None = None) -> list[dict]:
    rng = _rng(seed)
    items: list[dict] = []

    if domain == "python-code-reading" or domain == "code":
        pool = CODE_READING_BANK[:]
        rng.shuffle(pool)
        for item in pool[:n]:
            choices, answer = _shuffle_choices(rng, item["choices"][:], item["answer"])
            items.append({**item, "choices": choices, "answer": answer, "source": "local"})
        while len(items) < n:
            items.extend(items[: max(1, n - len(items))])
        return items[:n]

    seeds = DOMAIN_SEEDS.get(domain, [])
    if not seeds:
        # fall back to code-reading mixed with clinical potency
        seeds = DOMAIN_SEEDS["clinical"]

    # sample with replacement from templates for variety
    for _ in range(n):
        block = rng.choice(seeds)
        tmpl = rng.choice(block["templates"]).copy()
        mapping = {k: rng.choice(v) for k, v in block.get("vars", {}).items()}

        if "pic50_choices" in tmpl:
            pic50, ic50_label = rng.choice(tmpl["pic50_choices"])
            mapping["pic50"] = pic50
            mapping["ic50_label"] = ic50_label

        q = _fill(tmpl["q"], mapping)
        choices = [_fill(c, mapping) for c in tmpl["choices"]]
        answer = tmpl["answer"]
        choices, answer = _shuffle_choices(rng, choices, answer)
        item = {
            "topic": block["topic"],
            "question": q,
            "choices": choices,
            "answer": answer,
            "explanation": _fill(tmpl["explanation"], mapping),
            "source": "local",
        }
        if "code" in tmpl:
            item["code"] = tmpl["code"]
        items.append(item)
    return items


def generate_flashcards_local(domain: str, n: int = 12, seed: str | None = None) -> list[dict]:
    rng = _rng(seed)
    quiz = generate_quiz_local(domain, n=max(n, 10), seed=seed)
    cards = []
    for q in quiz[:n]:
        correct = q["choices"][q["answer"]]
        cards.append(
            {
                "topic": q["topic"],
                "front": q["question"],
                "back": f"{correct}\n\n{q['explanation']}",
                "source": "local",
            }
        )
    rng.shuffle(cards)
    return cards[:n]


def generate_micro_practice_local(topic_id: str, n_quiz: int = 6, n_cards: int = 6, seed: str | None = None) -> dict:
    rng = _rng(seed)
    topic = get_topic(topic_id)
    if not topic:
        raise ValueError(f"Unknown micro topic: {topic_id}")

    # Build Qs from lesson headings + code examples + focused templates
    bank: list[dict] = []
    for section in topic["lesson"]:
        bank.append(
            {
                "topic": topic["name"],
                "question": f"Regarding {topic['name']}: what is a key takeaway about \"{section['heading']}\"?",
                "choices": [
                    section["body"].split(".")[0] + ".",
                    "It only applies to organic solvent colorimetry.",
                    "It replaces the need for any experimental assay forever.",
                    "It means FASTA headers must contain emoji.",
                ],
                "answer": 0,
                "explanation": section["body"],
            }
        )
    for ex in topic.get("code_examples", []):
        bank.append(
            {
                "topic": f"Code · {ex['title']}",
                "question": "What does this code do?",
                "code": ex["code"],
                "choices": [
                    ex["explain"],
                    "Uploads the notebook to NCBI Entrez automatically",
                    "Converts all arrays to SMILES strings",
                    "Trains a docking engine from scratch",
                ],
                "answer": 0,
                "explanation": ex["explain"],
            }
        )

    # Add domain-flavored extras for code-reading topic
    if topic_id == "python-code-reading":
        bank.extend(CODE_READING_BANK)

    rng.shuffle(bank)
    quiz = []
    # Sample with wrap so we always return n_quiz items
    if not bank:
        bank = CODE_READING_BANK[:]
    for i in range(n_quiz):
        item = bank[i % len(bank)]
        choices, answer = _shuffle_choices(rng, item["choices"][:], item["answer"])
        q = {
            "topic": item.get("topic", topic["name"]),
            "question": item["question"],
            "choices": choices,
            "answer": answer,
            "explanation": item.get("explanation", ""),
            "source": "local",
        }
        if item.get("code"):
            q["code"] = item["code"]
        quiz.append(q)

    cards = []
    for section in topic["lesson"]:
        cards.append(
            {
                "topic": section["heading"],
                "front": f"{topic['name']}: {section['heading']} — what's the idea?",
                "back": section["body"],
                "source": "local",
            }
        )
    for ex in topic.get("code_examples", []):
        cards.append(
            {
                "topic": ex["title"],
                "front": f"What does this code do?\n\n{ex['code']}",
                "back": ex["explain"],
                "source": "local",
            }
        )
    for q in quiz:
        cards.append(
            {
                "topic": q["topic"],
                "front": q["question"] + (f"\n\n{q['code']}" if q.get("code") else ""),
                "back": f"{q['choices'][q['answer']]}\n\n{q.get('explanation','')}",
                "source": "local",
            }
        )
    rng.shuffle(cards)
    cards = cards[:n_cards]

    return {"quiz": quiz, "flashcards": cards}
