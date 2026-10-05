# FND: Evidence-Constrained, Local-First News Analysis with Explicit Abstention

**Authors:** _[Author names and affiliations]_  
**Target venue:** _[Workshop or journal to be selected]_  
**Status:** Pre-submission draft — results marked **TBD** require a reproducible experiment.

## Abstract

Automated misinformation systems are often presented as binary truth classifiers, although text style alone cannot establish whether a claim is true. We present FND, a local-first news-analysis system that separates three concerns: (i) a ModernBERT-based style-risk model, (ii) retrieval and structured review of public evidence, and (iii) a deterministic verdict policy. The policy only issues a definitive verdict when it receives qualifying, fetched, relevant evidence; otherwise it abstains as `UNVERIFIED` or `SUSPICIOUS_UNVERIFIED`. This design prevents a high-confidence style prediction from being represented as a factual conclusion. FND accepts text, URLs, and extracted media text, and exposes the resulting evidence, provenance fields, policy version, and timing data through shared API contracts. We describe the architecture, safety constraints, and a leakage-resistant evaluation protocol that uses source-disjoint and time-disjoint splits, external datasets, calibration, and selective-prediction metrics. Preliminary evaluation of an existing checkpoint on 8,932 long-form examples yielded 95.92% accuracy and 95.92% macro-F1; these figures are reported only as a reproduction result because the provenance and independence of the evaluation data have not yet been audited. The intended contribution is therefore a reproducible system and evaluation methodology for evidence-constrained analysis, rather than a claim that a writing-style classifier alone detects factual truth.

## 1. Introduction

Misinformation detection is socially consequential, but a classifier trained on document-level labels can learn publisher identity, formatting conventions, topical correlations, or duplicated text rather than factual correctness. This concern is particularly acute when labels are coarse or derived from sources rather than individual claims. Recent work documents substantial performance loss under source-disjoint evaluation, reinforcing the need to distinguish in-dataset discrimination from generalizable verification [1].

FND is designed around a narrower and safer proposition: a local model may provide a *style-risk signal*, while factual outcomes require independently reviewed evidence. The system treats abstention as a first-class result. A local score can raise a review priority, but cannot convert an unverified claim into `REAL` or `FAKE`.

Our contributions are:

1. An implementation of a local-first, multi-input analysis system that separates style scoring, evidence review, and decision policy.
2. A deterministic evidence policy that makes definitive outcomes conditional on source eligibility, independence, stance, and conflict checks.
3. An auditable result format with evidence provenance, policy version, confidence category, and latency fields.
4. A publication-ready evaluation protocol that measures source leakage, cross-domain performance, calibration, abstention, and end-to-end factual verification separately.

## 2. Related Work

LIAR established a widely used benchmark of 12.8K manually labelled political statements and illustrates the distinction between statement-level fact checking and article-level source classification [2]. FEVER formalized claim verification as classifying a claim with supporting evidence, including a `NotEnoughInfo` condition [3]. FND follows this evidence-centered view but is intended as a deployable local-first system that obtains public-web evidence and can explicitly abstain when that evidence is inadequate.

Dataset bias remains a principal validity risk. Baly et al. show that selection bias creates artifacts in unreliable-news datasets and report accuracy drops above ten percentage points when sources do not overlap between train and test [1]. Accordingly, FND’s evaluation must not use a random split as its sole reported result.

The system’s style component uses ModernBERT, an efficient long-context encoder architecture designed as a modern replacement for earlier encoder-only models [4]. It is explicitly a risk model, not the factual decision-maker.

## 3. System Design

### 3.1 Inputs and extraction

FND accepts raw text, a URL, or a locally supplied file/media artifact. Input-specific extractors normalize content into an `ExtractedDocument`. URL handling applies a safety policy before fetching; media flows may use OCR or transcription before analysis. The normalized document is passed to the style and evidence paths.

### 3.2 Style-risk model

The present implementation fine-tunes `answerdotai/ModernBERT-large` for binary `FAKE_STYLE`/`REAL_STYLE` classification. Training concatenates an optional title and body, normalizes labels, removes selected boilerplate, and removes exact duplicate prepared texts across train, validation, and test splits. At inference time, the result is a style-risk signal, confidence, word-count scope check, and explanation. It is never sufficient for a factual verdict.

### 3.3 Evidence review

For a deep check, FND extracts atomic claims, retrieves candidate sources, fetches and reviews candidates, and records source metadata and stance. Search snippets are discovery aids rather than qualifying evidence. The system excludes unfetched, irrelevant, mentions-only, outdated, original-claim, and low-reliability items from final decision eligibility.

### 3.4 Deterministic verdict policy

The policy has four externally visible outcomes: `REAL`, `FAKE`, `UNVERIFIED`, and `SUSPICIOUS_UNVERIFIED`. It returns `UNVERIFIED` when verification was not performed, failed, or yielded conflicting/insufficient evidence. It returns `SUSPICIOUS_UNVERIFIED` only when evidence is insufficient and the style signal is high risk within its reliable input scope. `REAL` requires at least two independent eligible supporting evidence groups. `FAKE` requires either two independent eligible contradicting groups or a directly contradicting high-reliability official source. Any mix of qualifying support and contradiction yields abstention.

This constraint is the key distinction between FND and a system that treats a text classifier probability as truth.

## 4. Evaluation Protocol

### 4.1 Research questions

- **RQ1:** How does the style model perform under random, source-disjoint, time-disjoint, and cross-dataset splits?
- **RQ2:** Do artifact removal and duplicate controls reduce apparent in-domain performance while improving external robustness?
- **RQ3:** Does the evidence policy reduce unsupported definitive verdicts relative to using the style model alone?
- **RQ4:** What coverage, error rate, calibration, latency, and abstention trade-offs does the full system exhibit?

### 4.2 Required data documentation

Before submission, publish a dataset card containing the origin, licence, date range, label definition, unit of annotation, source/publisher field, duplicate-removal rate, and exact split rule for every training and evaluation collection. The project contains a LIAR dataset note, but its current full-text training corpus has not been documented sufficiently for a research paper.

### 4.3 Splits and controls

Use the following preregistered evaluation conditions:

| Condition | Purpose | Required control |
| --- | --- | --- |
| Random held-out | Reproduction only | Exact-text and near-duplicate checks |
| Source-disjoint | Tests publisher/source leakage | No source appears in both train and test |
| Time-disjoint | Tests temporal robustness | Train dates precede test dates |
| Cross-dataset | Tests domain transfer | No hyperparameter tuning on target test set |
| Claim-verification set | Tests final verdicts | Gold label plus gold/annotated evidence when available |

Conduct artifact-only probes using title/source fragments, document length, boilerplate markers, and publisher metadata. If a probe matches the main model closely, do not claim semantic fact detection.

### 4.4 Baselines and metrics

Compare ModernBERT against a majority baseline, TF-IDF logistic regression, and a base encoder selected before test evaluation. Report macro-F1, class-wise precision/recall, AUROC, AUPRC, Brier score, expected calibration error, and confidence intervals across at least five random seeds. For the full decision system, separately report: definitive-verdict coverage, accuracy conditional on a definitive verdict, unsupported-definitive rate, abstention rate, evidence precision/recall, and end-to-end latency. Human adjudication must be blinded to system output and use at least two annotators with agreement statistics.

## 5. Current Preliminary Result

An existing saved evaluation reports 8,932 examples from `test_gt30_words.csv`, 95.92% accuracy, 95.92% macro-F1, Brier score 0.0387, ECE 0.0385, and throughput of 30.6 examples/s. This evaluation must be labelled **preliminary** because the stored summary references an external Drive path and does not record dataset provenance, split construction, model checkpoint hash, training seed, or source-disjointness. In addition, the same evaluation reports residual media/category markers after preprocessing. It is not valid evidence for a claim of near-perfect factual fake-news detection.

The repository also contains two 3,910-example evaluations with 100% accuracy. These should not be presented in a paper: both retain hundreds of media markers, and their perfect performance is a strong leakage warning rather than a publishable result.

## 6. Ethics, Limitations, and Reproducibility

Labels such as `fake` and `real` are context-dependent, may change over time, and can encode source or annotator bias. FND should not be used for automated moderation, ranking, or sanctions without human review, appeals, and a documented governance process. Public-web retrieval can introduce geographic, language, access, and freshness biases. Model confidence is not truth confidence.

Release the code revision, data cards or lawful dataset identifiers, split manifests, random seeds, model and tokenizer revisions, training configuration, environment lockfiles, evaluation predictions, and a reproducible command for every table. Do not release copyrighted source text unless its licence permits redistribution.

## 7. Conclusion

FND operationalizes a simple principle: content style can prioritize review, but factual verdicts need traceable evidence. Its deterministic policy turns that principle into a testable system constraint and makes abstention an expected outcome rather than a failure. The next research milestone is not a stronger headline accuracy; it is a rigorously documented evaluation showing whether the system remains useful once source, temporal, duplicate, and formatting leakage are controlled.

## References

[1] Ramy Baly, Giovanni Da San Martino, James Glass, and Preslav Nakov. 2021. *Hidden Biases in Unreliable News Detection Datasets.* EACL. https://aclanthology.org/2021.eacl-main.211/

[2] William Yang Wang. 2017. *“Liar, Liar Pants on Fire”: A New Benchmark Dataset for Fake News Detection.* ACL. https://aclanthology.org/P17-2067/

[3] James Thorne, Andreas Vlachos, Christos Christodoulopoulos, and Arpit Mittal. 2018. *FEVER: a Large-scale Dataset for Fact Extraction and VERification.* NAACL-HLT. https://aclanthology.org/N18-1074/

[4] Benjamin Warner et al. 2024. *Smarter, Better, Faster, Longer: A Modern Bidirectional Encoder for Fast, Memory Efficient, and Long Context Finetuning and Inference.* arXiv:2412.13663. https://arxiv.org/abs/2412.13663
