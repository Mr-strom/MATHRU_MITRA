/**
 * Orbiting Care Map: a dark neo-editorial landing page where celestial motion
 * makes a human-led maternal follow-up network feel visible and accountable.
 */
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CirclePlay,
  Headphones,
  HeartHandshake,
  Languages,
  Menu,
  Mic,
  MoveRight,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

const heroImage = "/manus-storage/maatrumitra-orbiting-care-hero_9ba94898.jpg";
const voiceNoteImage = "/manus-storage/maatrumitra-voice-note-field_aa6f3d4d.jpg";
const careThreadImage = "/manus-storage/maatrumitra-care-thread_ffa762a2.jpg";
const humanReviewImage = "/manus-storage/maatrumitra-human-review_230a6213.jpg";
const logoImage = "/manus-storage/maatrumitra-care-orbit-logo_1689796a.png";

type DemoStage = 0 | 1 | 2 | 3;

const steps = [
  {
    number: "01",
    title: "Hear the field note",
    text: "An ASHA speaks naturally in Kannada after a household visit. No long form. No duplicate register.",
  },
  {
    number: "02",
    title: "Make the care thread visible",
    text: "The note becomes an auditable follow-up record with only the information a supervisor needs to see.",
  },
  {
    number: "03",
    title: "Let people confirm the next step",
    text: "A proposed task waits for ANM confirmation before it becomes a reminder or escalation.",
  },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoStage, setDemoStage] = useState<DemoStage>(0);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const handleScroll = () => document.body.classList.toggle("is-scrolled", window.scrollY > 16);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const playDemo = () => {
    setConfirmed(false);
    setDemoStage(0);
    window.setTimeout(() => setDemoStage(1), 180);
    window.setTimeout(() => setDemoStage(2), 820);
    window.setTimeout(() => setDemoStage(3), 1600);
  };

  const openDemo = () => {
    scrollToSection("demo");
    playDemo();
  };

  return (
    <main className="site-shell">
      <header className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="MaatruMitra home">
          <img className="brand-mark" src={logoImage} alt="" />
          <span className="brand-name">Maatru<span>Mitra</span></span>
        </a>

        <nav className="nav-links" aria-label="Section links">
          <a href="#why">Why now</a>
          <a href="#flow">How it works</a>
          <a href="#safety">Safety</a>
        </nav>

        <button className="nav-cta" onClick={openDemo} type="button">
          Explore the flow <ArrowUpRight size={16} />
        </button>

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        >
          {menuOpen ? <X size={20} /> : <Menu size={21} />}
        </button>
      </header>

      {menuOpen && (
        <nav className="mobile-menu" aria-label="Mobile navigation">
          <a onClick={() => setMenuOpen(false)} href="#why">Why now</a>
          <a onClick={() => setMenuOpen(false)} href="#flow">How it works</a>
          <a onClick={() => setMenuOpen(false)} href="#safety">Safety</a>
          <button onClick={() => { setMenuOpen(false); openDemo(); }} type="button">Explore the flow <ArrowUpRight size={16} /></button>
        </nav>
      )}

      <section className="hero" id="top">
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy hero-reveal">
          <p className="eyebrow"><span className="eyebrow-dot" /> Karnataka · Maternal follow-up intelligence</p>
          <h1>Every mother<br />should stay <em>in view.</em></h1>
          <p className="hero-intro">
            MaatruMitra turns a 30-second Kannada field note into an auditable, human-confirmed follow-up—so the next maternal-care step does not get lost in a paper register.
          </p>
          <div className="hero-actions">
            <button className="button-primary" onClick={openDemo} type="button">
              <CirclePlay size={18} /> See a care note become action
            </button>
            <button className="button-text" onClick={() => scrollToSection("why")} type="button">
              The problem we solve <ArrowDownRight size={18} />
            </button>
          </div>
        </div>

        <div className="hero-orbit-wrap" aria-label="Illustration of a connected maternal care network">
          <img className="hero-visual" src={heroImage} alt="A glowing care network around a mother and frontline health worker" />
          <div className="hero-wash" aria-hidden="true" />
          <div className="orbit orbit-one" aria-hidden="true" />
          <div className="orbit orbit-two" aria-hidden="true" />
          <div className="orbit-node orbit-node-one" aria-hidden="true"><span>ASHA note</span></div>
          <div className="orbit-node orbit-node-two" aria-hidden="true"><span>ANM check</span></div>
          <div className="orbit-node orbit-node-three" aria-hidden="true"><span>Family</span></div>
          <div className="care-star star-a" aria-hidden="true">✦</div>
          <div className="care-star star-b" aria-hidden="true">✧</div>
          <div className="care-star star-c" aria-hidden="true">✦</div>
          <div className="hero-status card-rise">
            <div className="status-topline"><span className="status-pulse" /> Care thread active</div>
            <div className="status-detail"><span>04</span><p>follow-ups are waiting for a human confirmation</p></div>
          </div>
        </div>

        <div className="hero-index" aria-hidden="true"><span>01</span><span className="index-line" /><span>03</span></div>
      </section>

      <section className="proof-strip" aria-label="MaatruMitra product principles">
        <div><Mic size={18} /><span>Kannada voice, first</span></div>
        <div><ShieldCheck size={18} /><span>Non-diagnostic by design</span></div>
        <div><HeartHandshake size={18} /><span>ANM confirmation stays visible</span></div>
      </section>

      <section className="problem-section" id="why">
        <div className="section-anchor"><span>01</span><span>The gap</span></div>
        <div className="problem-layout">
          <div className="problem-statement">
            <p className="eyebrow eyebrow-dark">The gap is not concern. It is continuity.</p>
            <h2>A note should move<br />with the <em>mother.</em></h2>
          </div>
          <div className="problem-copy">
            <p>
              In a frontline worker’s day, a missed visit, an interrupted supplement routine, or a changed phone number can become one more handwritten line waiting to be noticed. MaatruMitra is designed as the small coordination layer between that visit and the next responsible person.
            </p>
            <a className="inline-link" href="#flow">Follow the care thread <MoveRight size={18} /></a>
          </div>
          <div className="problem-pullquote">
            <span className="quote-star">✦</span>
            <p>“The tool does not decide care. It makes the next follow-up impossible to overlook.”</p>
            <span className="quote-attribution">— product principle</span>
          </div>
        </div>
      </section>

      <section className="story-section">
        <div className="story-image-wrap"><img src={voiceNoteImage} alt="ASHA worker recording a Kannada voice note outside a home" /></div>
        <div className="story-copy">
          <p className="eyebrow"><Languages size={16} /> Built around the field language</p>
          <h2>Start with the<br /><em>way she speaks.</em></h2>
          <p>Instead of forcing a worker to translate a real conversation into a rigid form at the doorstep, the interface begins with a short Kannada note, then surfaces the fields that need review.</p>
          <div className="kannada-note">
            <div className="note-meta"><span><Mic size={13} /> Voice note</span><span>00:28</span></div>
            <p lang="kn">“ಗೀತಾ, ಆರು ತಿಂಗಳು. ಎರಡು ವಾರದಿಂದ ಐರನ್ ಮಾತ್ರೆ ತಪ್ಪಿದೆ. ನಾಳೆ ಮನೆಗೆ ಹೋಗಬೇಕು.”</p>
            <span className="note-translation">Geetha, six months. Iron tablets missed for two weeks. Home visit tomorrow.</span>
          </div>
        </div>
      </section>

      <section className="flow-section" id="flow">
        <div className="flow-background"><img src={careThreadImage} alt="Abstract care thread connecting follow-up moments" /></div>
        <div className="flow-heading">
          <div className="section-anchor section-anchor-light"><span>02</span><span>The flow</span></div>
          <h2>One note. A clear<br /><em>chain of care.</em></h2>
        </div>
        <div className="flow-steps">
          {steps.map((step) => (
            <article className="flow-step" key={step.number}>
              <span className="step-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <span className="step-arrow"><ChevronRight size={18} /></span>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-section" id="demo">
        <div className="demo-heading">
          <p className="eyebrow eyebrow-dark"><Sparkles size={15} /> An interactive starter flow</p>
          <h2>From field voice<br />to <em>visible action.</em></h2>
          <p>Try the UI prototype. It demonstrates the intended administrative workflow; it does not provide a diagnosis, prescription, or clinical decision.</p>
        </div>

        <div className="demo-console">
          <div className="console-topbar">
            <div className="console-brand"><img src={logoImage} alt="" /> <span>MaatruMitra field flow</span></div>
            <span className="prototype-badge">Prototype · no live data</span>
          </div>

          <div className="console-body">
            <div className="demo-rail" aria-label="Workflow progress">
              {[
                ["01", "Voice note"],
                ["02", "Follow-up card"],
                ["03", "ANM confirm"],
              ].map(([number, label], index) => (
                <div className={`rail-item ${demoStage >= index + 1 ? "is-active" : ""}`} key={number}>
                  <span>{number}</span><p>{label}</p>
                </div>
              ))}
            </div>

            <div className="demo-main">
              <div className={`voice-card demo-card ${demoStage >= 1 ? "is-live" : ""}`}>
                <div className="card-label"><span><Headphones size={14} /> Incoming field note</span><span className="card-time">Today · 09:42</span></div>
                <div className="voice-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                <p lang="kn">“ಗೀತಾ, ಆರು ತಿಂಗಳು. ಎರಡು ವಾರದಿಂದ ಐರನ್ ಮಾತ್ರೆ ತಪ್ಪಿದೆ. ನಾಳೆ ಮನೆಗೆ ಹೋಗಬೇಕು.”</p>
                <div className="card-footer"><span>Ward 03 · Chitradurga</span><span>00:28</span></div>
              </div>

              <div className={`followup-card demo-card ${demoStage >= 2 ? "is-live" : ""}`}>
                <div className="card-label"><span><Sparkles size={14} /> Structured follow-up</span><span className="review-label">Needs review</span></div>
                <div className="patient-row"><div className="patient-avatar">G</div><div><strong>Geetha</strong><span>Estimated gestation · 24 weeks</span></div></div>
                <div className="fact-grid">
                  <div><span>Follow-up</span><strong>Home visit due</strong></div>
                  <div><span>Note to review</span><strong>IFA interruption</strong></div>
                  <div><span>Suggested owner</span><strong>PHC ANM</strong></div>
                  <div><span>Source</span><strong>Worker voice note</strong></div>
                </div>
                <p className="guideline-note">Administrative flag only · review against approved local SOP before action.</p>
              </div>

              <div className={`confirm-card demo-card ${demoStage >= 3 ? "is-live" : ""} ${confirmed ? "is-confirmed" : ""}`}>
                <div className="card-label"><span><ShieldCheck size={14} /> Human checkpoint</span><span className="human-pill">ANM required</span></div>
                <h3>{confirmed ? "Follow-up logged" : "Confirm next follow-up?"}</h3>
                <p>{confirmed ? "The task is queued for the assigned team. The system has not made a clinical decision." : "Review the field note and local guideline before sending a reminder or escalation."}</p>
                {confirmed ? (
                  <div className="confirmed-action"><Check size={16} /> Pending team acknowledgement</div>
                ) : (
                  <button className="confirm-button" disabled={demoStage < 3} onClick={() => setConfirmed(true)} type="button">
                    Confirm &amp; log follow-up <ArrowUpRight size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="console-bottom">
            <p><span className="demo-safety-dot" /> No diagnosis. No prescription. Human confirmation remains required.</p>
            <button onClick={playDemo} type="button"><CirclePlay size={15} /> Replay the flow</button>
          </div>
        </div>
      </section>

      <section className="safety-section" id="safety">
        <div className="safety-visual"><img src={humanReviewImage} alt="ASHA and ANM colleagues reviewing a follow-up together" /><div className="safety-star">✦</div></div>
        <div className="safety-copy">
          <div className="section-anchor section-anchor-light"><span>03</span><span>The guardrail</span></div>
          <h2>Useful without<br />pretending to <em>be clinical.</em></h2>
          <p>MaatruMitra is an administrative coordination tool. It is designed to preserve the accountability of ASHAs, ANMs, and medical officers—not to replace their judgement.</p>
          <div className="guardrails">
            <div><ShieldCheck size={18} /><span><strong>No prescriptions.</strong> It never tells a mother what medicine to take.</span></div>
            <div><ShieldCheck size={18} /><span><strong>No autonomous escalation.</strong> Suggested follow-ups are visibly awaiting confirmation.</span></div>
            <div><ShieldCheck size={18} /><span><strong>Source-first records.</strong> Every flag stays linked to the originating worker note and approved guidance.</span></div>
          </div>
        </div>
      </section>

      <section className="closing-section">
        <div className="closing-orbit" aria-hidden="true"><span>✦</span><i /><b /></div>
        <p className="eyebrow"><span className="eyebrow-dot" /> A field-ready starting point</p>
        <h2>Keep the next<br />visit <em>in view.</em></h2>
        <p>This frontend starter gives the idea a clear visual system, a working interaction model, and a safety-led product narrative ready for further development.</p>
        <button className="button-primary" onClick={openDemo} type="button"><CirclePlay size={18} /> Revisit the product flow</button>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#top"><img className="brand-mark" src={logoImage} alt="" /><span className="brand-name">Maatru<span>Mitra</span></span></a>
        <p>Kannada-first maternal follow-up intelligence. Human-led, non-diagnostic, field-close.</p>
        <a href="#top" className="footer-top">Back to top <ArrowUpRight size={15} /></a>
      </footer>
    </main>
  );
}
