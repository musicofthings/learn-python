/**
 * HelixBench flashcards — Learning module
 * Topics match the Quiz banks in questions.js (same domain ids + topic labels).
 */
const FLASHCARDS = {
  genomics: [
    {
      topic: "BioPython · SeqIO",
      front: "How do you iterate SeqRecord objects from a multi-FASTA in BioPython?",
      back: "Use SeqIO.parse(handle, 'fasta'). It yields SeqRecord objects one-by-one — the standard pattern for multi-record FASTA in discovery pipelines. SeqIO.read() is only for a single-record file.",
    },
    {
      topic: "BioPython · Seq",
      front: "How do you reverse-complement a CDS with Bio.Seq before translating an antisense transcript?",
      back: "Call Seq.reverse_complement(). Example: Seq('ATGCGT').reverse_complement(). Do this before translate() on reverse-strand features.",
    },
    {
      topic: "BioPython · GC content",
      front: "Which Bio.SeqUtils helper computes GC fraction for CRISPR oligo design?",
      back: "Bio.SeqUtils.gc_fraction (historically GC). Use it on Seq or string inputs when checking oligo GC windows around a cut site.",
    },
    {
      topic: "BioPython · SeqRecord",
      front: "Which SeqRecord attribute becomes the FASTA header ID?",
      back: "record.id. The remainder of the header often comes from record.description; richer metadata lives in .annotations and .features.",
    },
    {
      topic: "BioPython · Entrez",
      front: "Which BioPython submodule wraps NCBI Entrez eUtils (efetch/esearch)?",
      back: "Bio.Entrez. Set email/tool for NCBI etiquette, then use esearch/efetch to pull RefSeq or GenBank records programmatically.",
    },
    {
      topic: "Multi-sequence · MSA",
      front: "How does BioPython commonly read/write multiple sequence alignments?",
      back: "Bio.AlignIO for Clustal, Stockholm, Phylip, and FASTA alignments — typical outputs from MAFFT or Clustal Omega used in conservation mapping.",
    },
    {
      topic: "Variant annotation",
      front: "Before reporting a coding SNP’s amino-acid consequence, what must you confirm?",
      back: "Transcript-aware coordinates (e.g. HGVS) and the correct isoform. Strand and isoform choice change residue numbering — don’t treat genomic index as AA index.",
    },
    {
      topic: "RNA-seq counts",
      front: "Joining bulk RNA-seq TPMs to a target list — what do you verify first?",
      back: "Gene ID namespace consistency (Ensembl vs Entrez vs symbols) and duplicate symbol collisions. ID mapping errors dominate omics joins.",
    },
    {
      topic: "Genome browsers · intervals",
      front: "How do you intersect ChIP peaks with gene promoters in Python?",
      back: "Use genomic interval tools (pybedtools, pyranges, interval trees) on BED/GFF coordinates — not cheminformatics fingerprints or SeqIO.translate.",
    },
    {
      topic: "Off-target search",
      front: "What drives guide RNA off-target screening in a CompBio pipeline?",
      back: "Fast approximate aligners / CRISPR off-target tools, then ranked mismatch reports against the reference genome. This is a genomic alignment problem, not Ro5 chemistry.",
    },
    {
      topic: "Expression QC",
      front: "Before ranking targets by disease vs normal expression, what QC matters most?",
      back: "Library size, batch effects, and whether disease labels are confounded with sequencing center. Batch/label confounding creates false differential expression.",
    },
    {
      topic: "Reference genomes",
      front: "Why pin a reference genome build (e.g. GRCh38) in pipeline config?",
      back: "Coordinates and annotations are build-specific. Mixing GRCh37/38 silently breaks variant and peak joins — pin the build and lift over when needed.",
    },
  ],

  chemistry: [
    {
      topic: "Cheminformatics · SMILES",
      front: "What does a SMILES string primarily encode?",
      back: "A linear text representation of a molecular graph (atoms and bonds). It is not a 3D conformer dump; fingerprints are derived descriptors, not SMILES itself.",
    },
    {
      topic: "Identifiers · InChIKey",
      front: "Why store InChIKey alongside SMILES in pharma compound warehouses?",
      back: "InChIKey is a fixed-length, standardized key for deduplication across tautomer/SMILES variants. Canonical SMILES still varies by toolkit.",
    },
    {
      topic: "Formats · SDF",
      front: "What does each molfile block in a multi-molecule SDF typically contain?",
      back: "A connection table (atoms/bonds) plus optional SD property tags (vendor ID, MW, etc.). SDF is the workhorse format for small-molecule libraries.",
    },
    {
      topic: "RDKit · molecules",
      front: "Which RDKit call parses SMILES into a molecule for descriptors?",
      back: "Chem.MolFromSmiles(smi). It returns None on invalid SMILES — always null-check before descriptor or fingerprint calculation.",
    },
    {
      topic: "RDKit · fingerprints",
      front: "What fingerprint is a common default for Tanimoto nearest-neighbor search?",
      back: "Morgan (ECFP-like) fingerprints, e.g. AllChem.GetMorganFingerprintAsBitVect, scored with Tanimoto similarity for ligand-based neighbors.",
    },
    {
      topic: "ADMET filters",
      front: "Which property set underpins Lipinski-style oral drug-likeness filters?",
      back: "MW, LogP, H-bond donors/acceptors (Veber often adds TPSA/rotatable bonds). These are heuristics, not hard go/no-go rules.",
    },
    {
      topic: "ChEMBL-style data",
      front: "Before QSAR on ChEMBL IC50 rows, what curation is essential?",
      back: "Harmonize units, handle censored/qualified values (>, <), and deduplicate by parent compound. Activity curation dominates model quality.",
    },
    {
      topic: "Descriptors · QSAR",
      front: "What feature set is typical for classical ligand-based QSAR?",
      back: "Physicochemical descriptors plus fingerprints (Morgan bits, LogP, TPSA, MW). Structure-based models may add pocket features separately.",
    },
    {
      topic: "RDKit · sanitization",
      front: "MolFromSmiles works but descriptor calc fails — common cause?",
      back: "Failed or incomplete sanitization / valence issues. Enforce SanitizeMol, clean broken vendor SMILES, and strip salts when needed.",
    },
    {
      topic: "Substructure filters",
      front: "How are PAINS-like alerts typically applied in RDKit?",
      back: "SMARTS-based structural filters (FilterCatalog or custom SMARTS). They are triage aids — not definitive proof of assay interference.",
    },
    {
      topic: "Molecular graphs · GNNs",
      front: "In a binding GNN, what are natural nodes and edges?",
      back: "Atoms as nodes (element, charge, hybridization…) and bonds as edges (order, conjugation…). Spatial models may add 3D distances.",
    },
    {
      topic: "Generative chemistry",
      front: "A SMILES VAE emits invalid strings — what mitigation fits production?",
      back: "Grammar/atom-aware decoders or graph generators, plus RDKit validity and property filters post hoc (valence, PAINS, property windows).",
    },
  ],

  molecular: [
    {
      topic: "Structures · PDB",
      front: "Which BioPython module parses PDB coordinate records?",
      back: "Bio.PDB (PDBParser / MMCIFParser). It builds Structure → Model → Chain → Residue → Atom hierarchies for structural biology work.",
    },
    {
      topic: "Bio.PDB · neighbors",
      front: "How do you find atoms within a distance cutoff of a ligand?",
      back: "NeighborSearch(atom_list).search(center, radius). Bio.PDB.NeighborSearch builds a KD-tree for efficient spatial queries.",
    },
    {
      topic: "Protein language models",
      front: "Valid use of ESM-style protein embeddings in drug discovery?",
      back: "Sequence embeddings as features for variant effect, binding, or tractability models — alongside structure cues. They are not SMILES generators by themselves.",
    },
    {
      topic: "Multi-omics · targets",
      front: "What evidence stack makes a coherent AI-first target prioritization?",
      back: "Genetics/omics evidence + tractability (structure, assays) + competitive landscape in one ranked model — not gene-symbol hype alone.",
    },
    {
      topic: "mmCIF vs PDB",
      front: "Why prefer mmCIF over legacy PDB text for large structures?",
      back: "mmCIF scales past PDB column limits and is the modern wwPDB primary format. Use MMCIFParser for large asymmetric units.",
    },
    {
      topic: "Pocket detection",
      front: "How should you define putative binding sites on an apo structure?",
      back: "Geometric/energetic pocket finders or homology-mapped orthosteric sites, then define the docking box — not random solvent cubes.",
    },
    {
      topic: "AlphaFold models",
      front: "What caveat must pipelines encode when docking into AlphaFold models?",
      back: "Check pLDDT/PAE confidence (loops, interfaces) before trusting pocket geometry. Low-confidence regions mislead structure-based design.",
    },
    {
      topic: "Multimodal fusion",
      front: "First failure mode to test in ligand+pocket+assay fusion models?",
      back: "Modality dropout and assay-type shift — missing pockets or new assay types. Ensure graceful degradation on incomplete discovery data.",
    },
    {
      topic: "Interface mutations",
      front: "What do you need to score PPI alanine scanning for biologics tractability?",
      back: "Structure-aware energy or ML on the complex — not sequence GC% or ligand fingerprints alone.",
    },
    {
      topic: "Selectivity structural",
      front: "Useful CompBio artifact for kinase selectivity cliffs?",
      back: "Aligned binding-site residues / interaction maps across off-target structures to connect SAR selectivity to pocket determinants.",
    },
    {
      topic: "Water / cofactors",
      front: "Why retain some crystallographic waters or cofactors during structure prep?",
      back: "Bridging waters and cofactors can define recognition. Blanket heteroatom deletion can distort the binding site.",
    },
    {
      topic: "Domain boundaries",
      front: "How does CompBio propose soluble kinase expression constructs?",
      back: "Domain annotation (Pfam/UniProt) plus disorder/pLDDT to propose construct boundaries — not random FASTA windows.",
    },
  ],

  biologics: [
    {
      topic: "BioPython · translation",
      front: "How do you translate an antibody Fv CDS to an amino-acid Seq?",
      back: "cds.translate() on a Bio.Seq object. Transcription alone does not produce protein; optional codon tables handle alternate genetic codes.",
    },
    {
      topic: "BioPython · Align",
      front: "Best Bio.Align approach for pairwise protein ortholog alignment?",
      back: "PairwiseAligner with a protein substitution matrix (e.g. BLOSUM62). Prefer this over deprecated pairwise2 for catalytic-site comparisons.",
    },
    {
      topic: "CDR annotation",
      front: "Why does antibody numbering scheme (Kabat/IMGT/Chothia) matter?",
      back: "CDR boundaries depend on the scheme — critical for humanization and liability scans. Schemes do not place CDRs at identical indices.",
    },
    {
      topic: "Developability",
      front: "How are antibody sequence liabilities typically flagged?",
      back: "Motif/rule scans on AA sequence (deamidation, isomerization, oxidation) plus structure context when available — not Lipinski on IgG SMILES.",
    },
    {
      topic: "Humanization",
      front: "What does CompBio compare when humanizing a murine mAb?",
      back: "Framework homology to human germline V-genes while preserving CDR structural integrity and binding.",
    },
    {
      topic: "PTMs",
      front: "How do you predict N-linked glycosylation risk on a therapeutic protein?",
      back: "Detect N-X-S/T sequons (X≠P) and refine with structural accessibility when possible.",
    },
    {
      topic: "Chain pairing",
      front: "From single-cell V(D)J data, how do you recover true IgG binders?",
      back: "Keep correct heavy–light pairing per cell barcode before translating and annotating CDRs. Random H–L pairs invent false antibodies.",
    },
    {
      topic: "Isoelectric point",
      front: "Why estimate pI for a mAb construct?",
      back: "Anticipate viscosity/clearance risks and guide buffer/formulation hypotheses. pI is a developability signal — not a potency substitute.",
    },
    {
      topic: "Ortholog cross-reactivity",
      front: "Before tox species selection, how do you assess epitope conservation?",
      back: "Align ortholog sequences/structures at the epitope and flag non-conservative substitutions. Matching gene symbols ≠ cross-reactivity.",
    },
    {
      topic: "Expression constructs",
      front: "Designing an scFv from VH/VL — what must you choose explicitly?",
      back: "Linker length/composition and orientation (VH–linker–VL vs reverse), plus liability checks. Naive concatenation risks folding/aggregation issues.",
    },
    {
      topic: "Allotype / immunogenicity",
      front: "Why track human allotypes and foreign epitopes on therapeutic antibodies?",
      back: "They inform immunogenicity risk and clinical ADA monitoring strategy in biologics development.",
    },
    {
      topic: "Stability predictors",
      front: "Sensible feature set for mAb stability ML?",
      back: "CDR/framework composition, net charge patches, SASA, and known liability motifs — biophysical features grounded in antibody engineering.",
    },
  ],

  docking: [
    {
      topic: "Docking post-processing",
      front: "Scores alone rank poorly after a large docking campaign — what triage helps?",
      back: "Pose clustering, interaction fingerprints, rescoring/ML, and visual/pharmacophore filters. Raw score alone is rarely enough.",
    },
    {
      topic: "3D · conformers",
      front: "First RDKit step for shape or pharmacophore screening?",
      back: "EmbedMolecule / ETKDG conformer generation, then align or shape-overlay before heavier MD/docking.",
    },
    {
      topic: "Grid box",
      front: "What should define a docking search box for a kinase ATP site?",
      back: "Known ligand/cofactor coordinates or a validated pocket center with adequate padding — not the whole asymmetric-unit centroid.",
    },
    {
      topic: "Pose clustering",
      front: "Why cluster docking poses before medchem review?",
      back: "Near-identical poses inflate hit lists. Cluster centroids diversify binding modes for human and IFP triage.",
    },
    {
      topic: "Interaction fingerprints",
      front: "Why compute interaction fingerprints after docking?",
      back: "IFPs encode residue/contact patterns, enabling similarity to known actives and contact-based filters — complementary to ligand-only fingerprints.",
    },
    {
      topic: "Protonation",
      front: "Why do ligand/pocket protonation and tautomer states matter before docking?",
      back: "Wrong protomers change H-bond patterns and ranking. pH-aware prep and tautomer enumeration are standard.",
    },
    {
      topic: "Consensus docking",
      front: "When does running multiple docking engines help?",
      back: "When you want consensus enrichment and to reduce engine-specific pose bias via orthogonal scoring/rescoring.",
    },
    {
      topic: "Induced fit",
      front: "Rigid receptor docking misses actives on a flexible loop-gated pocket. Response?",
      back: "Ensemble docking against multiple conformers/MD frames or induced-fit protocols — don’t ignore receptor flexibility.",
    },
    {
      topic: "Covalent docking",
      front: "What must covalent warhead docking include?",
      back: "Reactive residue definition and covalent constraints / warhead-aware protocols for attachment geometry.",
    },
    {
      topic: "Enrichment metrics",
      front: "Standard metric for reporting virtual-screen quality?",
      back: "Early enrichment / EF / ROC-AUC on known actives vs decoys (with decoy-bias caveats).",
    },
    {
      topic: "Clash / strain",
      front: "Top-scoring pose has severe strain and clashes — what next?",
      back: "Filter by strain/clash scores and keep physically plausible poses before synthesis proposals. Score does not override physics.",
    },
    {
      topic: "Water-mediated H-bonds",
      front: "Crystal pose relies on bridging waters — risk of docking without them?",
      back: "You may miss key recognition. Consider explicit waters, displaceable-water predictions, or pharmacophore constraints.",
    },
  ],

  clinical: [
    {
      topic: "Assay data · pandas",
      front: "Best pandas pattern to load an HTS plate CSV for IC50 QC?",
      back: "pd.read_csv(...) then coerce IC50 to numeric and filter. Handles headers, mixed types, and missing wells better than manual split/json hacks.",
    },
    {
      topic: "Units · potency",
      front: "pIC50 = 7.0 corresponds to roughly what IC50?",
      back: "100 nM. pIC50 = −log10(IC50[M]), so 7 → 10⁻⁷ M = 100 nM — common SAR reporting.",
    },
    {
      topic: "Assay pipelines",
      front: "How do you avoid leaking dose points into a potency model?",
      back: "Split by compound scaffold/series (or time) so all concentrations of a molecule stay in one fold — not random well-level shuffles.",
    },
    {
      topic: "Target engagement",
      front: "Why can naive pooling of cellular IC50 with biochemical Ki mislead?",
      back: "Assay modalities, protein forms, and conditions differ. Needs metadata-aware normalization; Cheng–Prusoff and permeability confound direct merges.",
    },
    {
      topic: "Train/test leakage",
      front: "0.98 AUROC on a random ChEMBL split but prospective failure — likely cause?",
      back: "Analogue/scaffold leakage. Random splits put near-duplicates in both sides; use scaffold or temporal splits.",
    },
    {
      topic: "Uncertainty",
      front: "What should an active-learning acquisition function balance?",
      back: "Predicted potency/utility vs epistemic uncertainty (explore–exploit) under wet-lab budget constraints.",
    },
    {
      topic: "Conformal / calibration",
      front: "Sound approach for pIC50 prediction intervals for medchem?",
      back: "Calibrated uncertainty (ensembles, conformal prediction) validated on scaffold-held-out series — not a fixed ±0.01 for every chemotype.",
    },
    {
      topic: "PK / exposure",
      front: "What else is needed to link in vitro potency to expected clinical dose?",
      back: "Clearance, bioavailability, plasma binding, and free-drug hypotheses — IC50 alone is not a dose.",
    },
    {
      topic: "Biomarkers",
      front: "CompBio support for a precision oncology trial hypothesis typically includes?",
      back: "Patient stratification features (genomics/expression) linked to pathway activity and response labels, with leakage controls.",
    },
    {
      topic: "Safety signals",
      front: "How should you triage secondary pharmacology / safety panel results?",
      back: "Normalize units, flag potent off-targets, and compare to on-target potency (therapeutic index) — don’t casually drop weak hits without review.",
    },
    {
      topic: "Real-world evidence",
      front: "Major analytical risk when exploring RWE for indication expansion?",
      back: "Confounding and selection bias. Needs careful cohorts — not naive correlations.",
    },
    {
      topic: "Federated / privacy",
      front: "Train a shared ADMET model across partners without sharing structures?",
      back: "Federated learning or share fingerprints/embeddings under contract — never raw IP SMILES by default.",
    },
  ],
};
