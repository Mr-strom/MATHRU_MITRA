# MaatruMitra — Research, Product Direction, and Upgrade Brief

**Prepared by:** Manus AI  
**Project type:** Kannada-first maternal follow-up intelligence concept  
**Current deliverable:** Animated frontend starter with a connected, non-live workflow prototype

## Executive Positioning

> **MaatruMitra is a human-confirmed follow-up layer for ASHA and ANM teams. It converts a short Kannada field note into a traceable administrative task, without diagnosing, prescribing, or replacing public-health systems.**

The opportunity is real, but it should be framed precisely. India’s RCH Portal already supports beneficiary tracking through the reproductive lifecycle, including antenatal services and alerts to ANMs, beneficiaries, and health managers.[1] MaatruMitra should therefore **not** claim to replace the RCH Portal or to be the source of truth. Its defensible role is earlier in the workflow: helping a field note become a clear, reviewable, source-linked follow-up before the next approved action or RCH entry is made.

| Design decision | Rationale | What the current starter demonstrates |
|---|---|---|
| Kannada voice note as entry point | Preserves the ASHA’s natural field workflow and reduces the need to translate observations into a form at the doorstep. | A visible Kannada note and a staged voice-to-record interaction. |
| Human checkpoint before action | Prevents an AI-generated flag from behaving like a medical instruction or autonomous escalation. | An explicit **ANM required** state and confirmation action. |
| Non-diagnostic product language | Keeps the product within an administrative coordination role while allowing clinical decisions to remain with responsible staff. | Repeated no-diagnosis/no-prescription guardrails. |
| “Care thread” narrative | Makes continuity—not automation—the core product value. | Orbital and star motion adapted from the supplied reference reel. |

## Evidence and Local System Fit

The Ministry of Health and Family Welfare describes the RCH Portal as a name-based system for early identification and tracking of beneficiaries across the reproductive lifecycle. It specifically references timely antenatal, postnatal, and delivery services, as well as alerts to ANMs, beneficiaries, and managers.[1] This is important: an MVP should complement RCH workflows rather than create a parallel clinical record.

PMSMA provides a useful operational context. Its public guidance emphasizes quality ANC, reaching women who missed or dropped out of ANC, individual high-risk pregnancy tracking, and alerts to beneficiaries and ASHAs for follow-up visits.[2] The product’s **administrative follow-up** value proposition is aligned with these workflow needs, but the prototype must not infer a high-risk pregnancy status from unverified free text.

The user-provided concept cites a change from 70.1% to 58.1% for four or more ANC visits. A secondary Karnataka-focused analysis reports the figures in a comparison that treats approximately 70% as Karnataka performance and 58.1% as the national NFHS-5 comparison point.[3] The pitch should therefore avoid saying that **Karnataka itself fell from 70.1% to 58.1%** unless a verified, state-specific NFHS table is added. A safer pitch is: **“Even where ANC coverage is relatively strong, the last-mile follow-up between a visit, a register, and the next responsible person remains fragile.”**

| Relevant system or program | What it already does | MaatruMitra’s appropriate relationship |
|---|---|---|
| RCH Portal | Tracks beneficiary services across the reproductive lifecycle and supports alerts.[1] | Be a field-note-to-review layer that can later create a supervised handoff to approved RCH workflows. |
| PMSMA / e-PMSMA | Supports ANC sessions, HRP line-listing, and follow-up alerts.[2] | Surface only **administrative follow-up tasks**; a clinical status remains the responsibility of approved clinicians and programs. |
| ASHA Kirana / M-CAT | Used structured questions and algorithms to support clinician assessment in Karnataka; its feasibility work emphasized training and ongoing field support.[4] | Learn from the worker-empowerment approach, but keep this first MVP narrower and non-diagnostic. |
| Maatr | A separate AI-oriented maternal-health app was tested with approximately 90 frontline workers in Karnataka, with features spanning tracking, voice technology, and remote-support ambitions.[5] | Differentiate through a narrow, source-cited, Kannada-first, human-confirmed administrative workflow. |
| mSakhi | A smartphone job aid and electronic record system built for frontline workers, including referrals and multiple program functions.[6] | Avoid becoming another large record system; excel at one high-frequency “voice note → follow-up” moment. |

## Market Assessment and Differentiation

The research confirms that the category is not empty. Existing initiatives demonstrate that maternal tracking, job aids, digital records, and even AI-supported maternal-health workflows can be deployed with frontline workers.[4] [5] [6] That is a validation signal, not a reason to make MaatruMitra broader. The first version becomes more credible when it focuses on a single friction point that larger systems leave awkward: converting vernacular, contextual field observations into an accountable follow-up queue.

No directly matching public product under the exact name **MaatruMitra** appeared in a narrow web check. That is not trademark clearance. Before public launch, conduct a formal name, domain, and trademark review in India.

| Existing pattern | Category risk | MaatruMitra’s differentiator |
|---|---|---|
| Digital register / EHR | Recreates structured entry burden for workers. | Spoken, source-preserving capture followed by a small review card. |
| Clinical AI screener | Raises clinical-safety, validation, and liability requirements quickly. | Strictly administrative prioritization, with no diagnosis or prescription. |
| Generic health chatbot | Loses ownership, escalation path, and auditability. | Named worker note, named task owner, time-stamped human confirmation. |
| Automated reminder tool | Can send the wrong prompt from incomplete or outdated information. | Reminder dispatch only after an authorized person confirms the action. |

## Product Strengths and Constraints

| Strengths | Constraints and risks | Design response |
|---|---|---|
| A clear, emotionally resonant problem: missed follow-up is understandable to juries and pilot partners. | Maternal-health language can accidentally imply diagnosis or clinical advice. | Use “administrative flag,” “suggested owner,” and “review required”; never use disease labels inferred by a model. |
| A short demo arc: voice note → structured card → human confirmation. | Kannada speech recognition quality will vary by district, accent, noise, code-switching, and device. | Preserve audio, show editable transcript, capture confidence, and provide a manual correction route. |
| Aligns with recognized outreach and follow-up workflows. | Parallel records can burden workers and fragment official reporting. | Integrate only after workflow mapping with local authorities; avoid duplicate data entry. |
| Strong interface motif from the reference reel. | Dark cinematic design can make a field tool feel more like a portfolio than a service. | Use the rich visual treatment for the landing page; make the operational worker view high-contrast, sparse, and offline-friendly. |
| Human confirmation produces a simple safety story. | Confirmation can become a meaningless click if workload is not designed well. | Require owner, due date, rationale, and status—but keep each review card brief. |

## Recommended Scope: What to Build Next

### Phase A — Demonstrable MVP

Build only the loop that validates the operational hypothesis. A worker uploads or records a **consented, synthetic demo note**; the system transcribes it; the worker corrects the transcript; a rules-plus-retrieval layer produces a structured **administrative** record; an ANM confirms or edits the next task; and the activity is written to an audit log. Do not send messages, consume patient data, or label risk in the first public demo.

| Component | MVP behaviour | Must not do |
|---|---|---|
| Audio capture | Record or upload a short Kannada demo audio clip. | Claim medical-grade transcription accuracy. |
| Transcript review | Show original audio, transcript, language confidence, and edit controls. | Treat raw transcription as authoritative. |
| Extraction | Identify operational fields: person reference, location, timing, interrupted routine, proposed owner, and follow-up due date. | Diagnose conditions, calculate clinical severity, or prescribe. |
| Guidance retrieval | Cite an approved operational SOP excerpt tied to the task category. | Retrieve uncontrolled web content or present uncited LLM prose as policy. |
| Confirmation | Require named ANM/authorized reviewer to approve, revise, or dismiss a task. | Auto-send notifications or escalate without review. |
| Audit log | Save original note reference, edits, source citation, reviewer, and timestamp. | Store unnecessary identifiable health data. |

### Phase B — Field Pilot Readiness

The next upgrade should be **offline-first mobile capture**, encrypted local storage, role-specific queues, edit history, field-testable Kannada copy, and controlled reminder templates. Pilot with a small, supervised cohort only after a field workflow co-design session. ASHA Kirana’s experience illustrates why training, practical support, and repeated debriefing matter as much as the software itself.[4]

### Phase C — Institutional Integration

Only after validation should the project explore approved integration pathways with official systems. The correct objective is not “connect to every health portal”; it is to reduce duplicate work through a governed handoff. This phase requires formal data-protection review, consent and retention policy, security assessment, authority agreements, and a clinical governance group.

## Technical Architecture Recommendation

| Layer | MVP recommendation | Why |
|---|---|---|
| Frontend | Responsive React/PWA with local encrypted draft queue. | Supports field-friendly capture and a gradual offline path. |
| Speech | Kannada-capable speech-to-text with explicit transcript correction and raw-audio retention rules. | The worker should be able to correct the model before downstream use. |
| Structuring | Schema-constrained extraction plus deterministic validation. | Makes the proposed task inspectable and easier to test. |
| Knowledge | Small, versioned corpus of approved SOP excerpts with page/section citations. | Prevents uncontrolled answers and makes every suggestion traceable. |
| Workflow engine | State machine: Draft → Worker reviewed → Awaiting ANM → Confirmed / Revised / Dismissed. | Keeps human accountability visible. |
| Data | Minimum necessary data, field-level access control, audit log, and retention schedule. | Patient data warrants disciplined governance from day one. |

## Safety, Privacy, and Governance Requirements

MaatruMitra should be described as a coordination support product, not a medical device or diagnostic assistant. It needs local clinical and programmatic review before any use with actual beneficiaries. The first demo should use only synthetic identities and consented, non-sensitive audio.

| Requirement | Minimum implementation standard |
|---|---|
| Consent | Explain what is recorded, why, who can access it, and when it is deleted; document consent in the workflow. |
| Human oversight | Prevent automatic messaging, clinical routing, or “high-risk” labels without review by an authorized human. |
| Data minimization | Keep only fields needed to manage a follow-up; avoid free-text histories unless necessary and approved. |
| Traceability | Retain source-note link, transcript edits, model version, retrieved guidance version, reviewer, and timestamp. |
| Bias monitoring | Test across dialects, noisier recordings, mixed Kannada-English speech, and different literacy levels. |
| Pilot governance | Convene ASHAs, ANMs, medical officers, privacy/security reviewers, and district program owners before field testing. |

## Landing-Page Design Specification

The supplied reel is published by **@shutterkif** and links to the public `shutterkif-oss/nomad-portfolio` repository.[7] Its useful transferable principles are a strong single motif, deliberate sequencing, cinematic darkness, custom easing, vignette depth, and reduced-motion support. The MaatruMitra implementation adapts those principles—not the source code, copy, brand, or 3D assets.

| Visual element | Implementation in this starter |
|---|---|
| Single motif | An open care orbit and repeated stars represent a connected follow-up network. |
| Motion | Slow 22–36 second orbital motion, drifting nodes, staggered card reveals, and a short staged demo. |
| Typography | DM Serif Display for compassionate editorial hierarchy; Manrope for operations; Noto Sans Kannada for field-language content. |
| Palette | Ink-black ground, deep marigold action signals, leaf-green confirmation state, and warm paper reading zones. |
| Layout | Asymmetric, story-led vertical journey rather than a generic centered SaaS grid. |

## References

[1] [Ministry of Health & Family Welfare, **Reproductive and Child Health (RCH) Portal**](https://rch.mohfw.gov.in/RCH/about-rch.aspx)  
[2] [Ministry of Health & Family Welfare, **Pradhan Mantri Surakshit Matritva Abhiyan — About**](https://pmsma.mohfw.gov.in/about-scheme/)  
[3] [Kulkarni et al., **Mapping Maternal Health Care Services utilization in Karnataka using NFHS-4 and NFHS-5**, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12488109/)  
[4] [Srinidhi et al., **ASHA Kirana: when digital technology empowered front-line health workers**, BMJ Global Health](https://pmc.ncbi.nlm.nih.gov/articles/PMC8458334/)  
[5] [Capgemini, **Tracking maternal health: Maatr**](https://www.capgemini.com/news/inside-stories/tracking-maternal-health/)  
[6] [IntraHealth International, **mSakhi: Mobile Phone App for Frontline Health Care**](https://www.intrahealth.org/msakhi-award-winning-mobile-phone-app-frontline-health-care)  
[7] [shutterkif-oss, **nomad-portfolio**](https://github.com/shutterkif-oss/nomad-portfolio)
