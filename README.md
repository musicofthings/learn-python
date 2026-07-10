# HelixBench

Interactive BioPython / computational biology quiz for **pharma AI drug discovery** interview prep.

## Domains

Sessions are organized by scientific domain (not generic Python trivia):

- **Genomics** — SeqIO, Entrez, MSA, CRISPR oligos, expression QC
- **Chemistry** — SMILES, RDKit, fingerprints, ADMET, QSAR, generative chemistry
- **Molecular** — PDB/mmCIF, pockets, protein LMs, target prioritization
- **Biologics** — antibodies, translation, CDRs, developability, orthologs
- **Docking** — poses, IFPs, conformers, enrichment, covalent setup
- **Clinical** — assays, pIC50, scaffold splits, PK translation, biomarkers, uncertainty

## How to play

1. Open the app and pick a domain.
2. Each session has **10 multiple-choice** questions sampled from that domain’s bank.
3. **Question order and answer choices are shuffled** every run.
4. Answers reveal **immediately** with **green / red** feedback and a short explanation.
5. Finish with a score breakdown; retry or switch domains anytime.

## Run locally

No build step. From the repo root:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

Or open `index.html` directly in a browser.

## Stack

Static HTML, CSS, and vanilla JavaScript (`js/questions.js`, `js/app.js`).
