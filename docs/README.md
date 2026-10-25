# Documentation

Every document in the repo, grouped by who it is for. The repo root keeps only [README.md](../README.md), [ARCHITECTURE.md](../ARCHITECTURE.md), [INSIGHTS.md](../INSIGHTS.md) (the deliverables the brief asks for) and [CLAUDE.md](../CLAUDE.md) (the coding agent's rules).

## Reading order, from scratch
The first five give the whole picture; the rest goes deeper on each part.

**1. The problem**
1. [source/ASSIGNMENT_BRIEF.md](source/ASSIGNMENT_BRIEF.md): what LILA asked for and how it's graded
2. [source/DATA_README.md](source/DATA_README.md): the raw data as LILA describes it (some claims are wrong; see 5 and 8)

**2. The answer, short**

3. [README.md](../README.md): what the tool is, the live URL, how to run it
4. [ARCHITECTURE.md](../ARCHITECTURE.md): the design on one page: data flow, coordinate mapping, assumptions, trade-offs
5. [INSIGHTS.md](../INSIGHTS.md): what the tool shows about the game

**3. The answer, in full**

6. [reports/ARTICLE.md](reports/ARTICLE.md): the build story: decisions, reversals, problems hit (easiest long read)
7. [reports/TECHNICAL_REPORT.md](reports/TECHNICAL_REPORT.md): the reference version: every edge case, coordinate checks, verification, limits
8. [reports/EDGE_CASES.md](reports/EDGE_CASES.md): one row per data issue, with the test that covers it

**4. Proof**

9. [evidence/README.md](evidence/README.md): every assumption (A1–A22) with its evidence; follow its links only where you doubt a claim
10. [audits/forensic/FORENSIC_AUDIT_REPORT.md](audits/forensic/FORENSIC_AUDIT_REPORT.md): an independent recheck of the data and the pipeline's numbers

**5. How it was built (only if you'll change the code)**

11. [CLAUDE.md](../CLAUDE.md): the rules and the Decisions table (every design choice and why)
12. [specs/README.md](specs/README.md), then specs `01` to `08` in order, then [10_DASHBOARD.md](specs/10_DASHBOARD.md) (skip `09_CHATBOT.md`: removed)
13. [specs/FRONTEND_GUIDELINES.md](specs/FRONTEND_GUIDELINES.md): how the web app looks and behaves
14. [audits/uiux/README.md](audits/uiux/README.md): the UI/UX audit's summary and open issues
15. [specs/COMMIT_CONVENTION.md](specs/COMMIT_CONVENTION.md): commit message format

Skip `archive/` (replaced) and `evidence/screenshots/` (older UI versions).

## Where to start, by task
| You want to… | Read |
|---|---|
| Run the tool or deploy it | [README.md](../README.md) |
| Understand the design in one page | [ARCHITECTURE.md](../ARCHITECTURE.md) |
| See what the tool shows about the game | [INSIGHTS.md](../INSIGHTS.md) |
| Check how a data issue is handled | [reports/EDGE_CASES.md](reports/EDGE_CASES.md) |
| Check the evidence behind an assumption | [evidence/README.md](evidence/README.md) |
| Build or change a feature | [specs/README.md](specs/README.md) |

## `reports/`: for reviewers
| File | What it is |
|---|---|
| [TECHNICAL_REPORT.md](reports/TECHNICAL_REPORT.md) | The reference version of ARCHITECTURE.md: the data, every edge case, coordinate mapping and its checks, verification, trade-offs, limits, walkthrough script |
| [ARTICLE.md](reports/ARTICLE.md) | The build story: system design, decisions and why some were reversed, problems hit, every file |
| [EDGE_CASES.md](reports/EDGE_CASES.md) | The register: one row per data issue (EC-01 to EC-30) with evidence, handling, status and test names |

## `specs/`: for building
| File | What it is |
|---|---|
| [README.md](specs/README.md) | Order of the feature specs and how they are written |
| `01_…` to `08_…` | One spec per feature, in build order |
| [10_DASHBOARD.md](specs/10_DASHBOARD.md) | The Overview statistics (`stats.json`) |
| [09_CHATBOT.md](specs/09_CHATBOT.md) | The chat feature, removed; kept as history |
| [FRONTEND_GUIDELINES.md](specs/FRONTEND_GUIDELINES.md) | How the web app looks and behaves; wins over the feature specs where they differ |
| [COMMIT_CONVENTION.md](specs/COMMIT_CONVENTION.md) | Commit message format |

## `source/`: what LILA supplied
| File | What it is |
|---|---|
| [ASSIGNMENT_BRIEF.md](source/ASSIGNMENT_BRIEF.md) | The assignment as given |
| [DATA_README.md](source/DATA_README.md) | The README shipped with the data. Some of its claims are wrong; see EDGE_CASES.md |

## `audits/`: independent reviews
| Folder | What it is |
|---|---|
| [uiux/](audits/uiux/README.md) | UI/UX audit of the web app (2026-10-24): issue register UX-01 to UX-26, recommendations, validation plan, screenshots |
| [forensic/](audits/forensic/FORENSIC_AUDIT_REPORT.md) | Independent data audit in three parts (independent counts, reconciliation, follow-up), with the scripts that produced every number |

## `evidence/`: the proof behind the claims
Start at [evidence/README.md](evidence/README.md): every assumption (A1–A22) with its evidence, and an index of every evidence file. Some folders are written by pipeline tools and keep fixed paths.

| Folder / file | What it is | Written by |
|---|---|---|
| `build_report.json` | Pipeline counts: files, rows, duplicates, actors, dates | `make data` |
| `coordinates/` | Map-alignment checks: GrandRift with and without the y-flip, reverse mapping on all three maps | `pipeline/validate_map_alignment.py`, `pipeline/validate_reverse_mapping.py` |
| `event_forensics/` | Actor classification, Kill/Killed pairs, heatmap impact | `pipeline/tools/event_forensics.py` |
| `spatial_analysis/` | Heatmap sparsity, stability, resolution, colour encoding, count bands | `pipeline/tools/` |
| `frontend_verification/` | Check that the site shows exactly the numbers the pipeline produced | its own scripts |
| `hotspot_rules_compare.md` | Old vs new hotspot rule | by hand |
| `screenshots/` | Pictures of **earlier UI versions** (heatmap visual pass, first hotspot layer, tabs and outlines). Not the current look | by hand |
| `ASSUMPTIONS_AND_EVIDENCE.pdf` | PDF export of an earlier copy of `evidence/README.md` | by hand |

## `archive/`: superseded, kept for history
| File | What it is |
|---|---|
| `GLOBAL_CONTEXT.md` | The brief and data README pasted together as early agent context; replaced by `source/` |
| `observations.md` | First-day working notes (2026-10-21); replaced by EDGE_CASES.md and the reports. Gitignored, local only |
