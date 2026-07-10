# HelixBench

Interactive BioPython / computational biology **learning + quiz** app for pharma AI drug discovery interview prep.

## Modules

1. **Flashcards (Learning)** — study prompts/answers by domain; deck is shuffled every session
2. **Quiz (Assessment)** — 10 multiple-choice questions; questions and choices shuffled every run

Topics are matched one-to-one between Learning and Quiz within each domain.

## Domains

- **Genomics** — SeqIO, Entrez, MSA, CRISPR oligos, expression QC
- **Chemistry** — SMILES, RDKit, fingerprints, ADMET, QSAR, generative chemistry
- **Molecular** — PDB/mmCIF, pockets, protein LMs, target prioritization
- **Biologics** — antibodies, translation, CDRs, developability, orthologs
- **Docking** — poses, IFPs, conformers, enrichment, covalent setup
- **Clinical** — assays, pIC50, scaffold splits, PK translation, biomarkers, uncertainty

## How to use

1. Open the app and choose **Flashcards** or **Quiz**.
2. Pick a domain category.
3. Flashcards: click to flip; navigate Previous / Next; **Shuffle deck** anytime.
4. Quiz: answer for instant **green / red** feedback; finish with a score breakdown.
5. Jump between study and quiz for the same domain from the end screens.

## Run locally

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080).

## Stack

Static HTML/CSS and vanilla JS:

- `js/questions.js` — domains + quiz banks
- `js/flashcards.js` — learning cards (same topics)
- `js/app.js` — UI and session logic
