import { useState, useRef, useEffect } from "react";

// ── API ───────────────────────────────────────────────────────────────────────
async function callAI(system, text, apiKey, maxTokens = 2000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: text }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map(b => b.text || "").join("") ?? "";
}

function parseJSON(raw) {
  const s = raw.replace(/```json|```/g, "").trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i === -1 || j === -1) throw new Error("No JSON");
  return JSON.parse(s.slice(i, j + 1));
}

// ── Prompts ───────────────────────────────────────────────────────────────────
const PROMPTS = {
  humanizer: (mode) => `You are the world's best AI text humanizer. Rewrite the given text to sound completely human-written.

Mode: ${mode}
${mode === "Academic" ? "- Maintain scholarly tone but add natural academic voice, varied sentence structure, thoughtful transitions" : ""}
${mode === "Casual" ? "- Make it conversational, relaxed, add personality, contractions, natural flow" : ""}
${mode === "Professional" ? "- Business-appropriate, clear, confident, natural professional voice" : ""}
${mode === "Undetectable" ? "- Maximum humanization: destroy all AI patterns, extreme burstiness, personal voice, imperfections, contractions, em dashes, varied rhythm" : ""}

Rules:
- Vary sentence lengths dramatically (3-word sentences AND 40-word sentences)
- Add natural human imperfections and personality
- Remove ALL: furthermore, moreover, additionally, in conclusion, it is important to note, it is crucial, delve, multifaceted
- Use contractions naturally
- Add personal-sounding observations
- Return ONLY the rewritten text, nothing else`,

  detector: `You are the world's most advanced AI content detector, more strict than Turnitin and Originality.ai combined.

Analyze every linguistic signal. Return ONLY raw JSON:
{
  "aiScore": <0-100, aggressive scoring>,
  "humanScore": <100 minus aiScore>,
  "verdict": "Human-Written|Likely Human|Mixed|Likely AI|AI-Generated",
  "confidence": "Low|Medium|High|Very High",
  "perplexity": "Low|Medium|High",
  "burstiness": "Low|Medium|High",
  "stylometry": "Uniform|Slightly Varied|Varied|Highly Varied",
  "aiWords": ["<AI vocabulary found>"],
  "sentences": [
    {"text": "<first 60 chars of sentence>", "risk": "low|medium|high", "reason": "<why>"}
  ],
  "signals": [{"label": "<signal>", "detail": "<evidence>", "severity": "low|medium|high"}],
  "humanSignals": [{"label": "<signal>", "detail": "<evidence>"}],
  "summary": "<3 sentence Turnitin-style verdict>",
  "recommendation": "<specific advice>"
}

SCORING RULES:
- Start at 0, add: Low perplexity +22, Low burstiness +20, AI vocabulary +12 each, Perfect structure +12, No personality +10, Passive voice overuse +7, Perfect transitions +6, Zero errors +6
- 0-25pts=15-30%, 26-40=35-55%, 41-60=60-80%, 61+=82-98%
- ChatGPT essays typically score 85-95%
- Human student essays 20-40%
- NEVER round to nice numbers
- Analyze up to 10 sentences for sentence-level highlighting`,

  paraphraser: (style) => `You are an expert paraphraser. Rewrite the text in "${style}" style while preserving meaning.

Styles:
- Standard: Clear, natural rewrite
- Formal: Academic/professional language
- Simple: Easy to understand, short sentences
- Creative: More expressive, varied vocabulary
- Fluency: Optimized for natural reading flow

Return ONLY the paraphrased text. No explanation.`,

  grammar: `You are a strict professional copy editor. Analyze the text comprehensively.
Return ONLY raw JSON:
{"corrected":"<full corrected text>","score":<0-100>,"issues":[{"type":"Grammar|Spelling|Punctuation|Style|Clarity","original":"<snippet>","suggestion":"<fix>","explanation":"<rule>","severity":"critical|major|minor"}],"improvements":["<improvement suggestion 1>","<improvement suggestion 2>"],"readabilityScore":<0-100>,"summary":"<2 sentence assessment>"}`,

  essay: `You are an expert academic essay writer. Generate a well-structured, original essay based on the given topic and requirements.
Return ONLY raw JSON:
{"title":"<essay title>","thesis":"<clear thesis statement>","outline":["<section 1>","<section 2>","<section 3>","<section 4>","<conclusion>"],"essay":"<full essay text with proper paragraphs, minimum 500 words>","wordCount":<number>,"citations":["<suggested citation 1>","<suggested citation 2>","<suggested citation 3>"]}`,

  summarizer: `You are an expert summarizer. Create a comprehensive summary.
Return ONLY raw JSON:
{"summary":"<concise 3-5 sentence summary>","keyPoints":["<point 1>","<point 2>","<point 3>","<point 4>","<point 5>"],"mainTheme":"<one sentence>","sentiment":"Positive|Negative|Neutral|Mixed","wordCount":{"original":<n>,"summary":<n>,"reduction":"<percent>"},"topics":["<topic 1>","<topic 2>","<topic 3>"]}`,

  support: `You are the expert AI support agent for HumanWrite AI — a premium AI writing and detection platform.

PLATFORM FEATURES:
1. AI Humanizer — rewrites AI text to bypass Turnitin, Originality.ai, GPTZero. Modes: Academic, Casual, Professional, Undetectable
2. AI Detector — ultra-strict detection checking perplexity, burstiness, stylometry. Shows sentence-level highlighting
3. Paraphraser — multiple rewrite styles (Standard, Formal, Simple, Creative, Fluency)
4. Grammar Checker — professional editing with readability scores
5. Essay Generator — structured academic essays with thesis and citations
6. Summarizer — bullet points and concise summaries

PLANS: Free (300 words/day) | Weekly £7 | Monthly £15 | Yearly £100 (save £80)
STUDENT DISCOUNT: 15% off all plans — verify with student email or ID
PAYMENTS: Stripe — all major cards, PayPal, Apple Pay, Google Pay

HOW IT WORKS:
- Enter API key to unlock all features
- Select tool from sidebar
- Paste or type text
- Click process button
- Copy or export results

AI DETECTOR: Uses perplexity (word predictability), burstiness (sentence variation), and stylometry (writing patterns). ChatGPT essays typically score 85-95%. Human text scores 20-40%.

HUMANIZER: Undetectable Mode gives maximum bypass capability. Works against Turnitin, GPTZero, Originality.ai, Winston AI, Copyleaks.

Be warm, professional, concise (2-4 sentences). Never mention Claude or Anthropic.
If asked what AI powers it: "We use proprietary AI models — we keep that confidential."`,
};

// ── Stripe ────────────────────────────────────────────────────────────────────
const STRIPE = {
  weekly: "https://buy.stripe.com/REPLACE_WEEKLY",
  monthly: "https://buy.stripe.com/REPLACE_MONTHLY",
  yearly: "https://buy.stripe.com/REPLACE_YEARLY",
};

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  indigo: "#6366f1",
  indigo2: "#4f46e5",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  sky: "#0ea5e9",
};

function th(dark) {
  return {
    bg: dark ? "#0a0a0f" : "#f8f9ff",
    sidebar: dark ? "#0f0f17" : "#ffffff",
    card: dark ? "#13131f" : "#ffffff",
    card2: dark ? "#1a1a2e" : "#f1f0ff",
    border: dark ? "#1e1e32" : "#e5e4ff",
    text: dark ? "#e8e8ff" : "#0a0a1a",
    muted: dark ? "#6b6b9a" : "#6b6ba8",
    nav: dark ? "rgba(10,10,15,0.95)" : "rgba(248,249,255,0.95)",
    input: dark ? "#0f0f17" : "#ffffff",
  };
}

// ── Auth Helpers ──────────────────────────────────────────────────────────────
function getUsers() { try { return JSON.parse(localStorage.getItem("hw_users") || "[]"); } catch { return []; } }
function saveUsers(u) { localStorage.setItem("hw_users", JSON.stringify(u)); }
function hash(p) { let h = 0; for (let c of p) h = Math.imul(31, h) + c.charCodeAt(0) | 0; return String(h); }
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

// ── Key Screen ────────────────────────────────────────────────────────────────
function KeyScreen({ user, onSave, onLogout, dark }) {
  const t = th(dark);
  const [k, setK] = useState("");
  const [e, setE] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: dark ? "linear-gradient(135deg,#0a0a0f,#12082a)" : "linear-gradient(135deg,#f0f0ff,#e8e4ff)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 440, background: t.card, border: `1px solid ${t.border}`, borderRadius: 24, padding: "2.5rem", boxShadow: dark ? "0 30px 80px rgba(99,102,241,0.15)" : "0 30px 80px rgba(99,102,241,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg,${C.indigo},${C.violet})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.85rem", boxShadow: `0 8px 24px ${C.indigo}45` }}>
            <span style={{ fontSize: "1.4rem" }}>✍️</span>
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", margin: 0 }}>HumanWrite AI</h1>
          <p style={{ color: t.muted, fontSize: "0.85rem", marginTop: "0.3rem" }}>Welcome back, {user?.name?.split(" ")[0]}!</p>
        </div>
        <p style={{ color: t.muted, fontSize: "0.87rem", lineHeight: 1.65, marginBottom: "1.4rem", textAlign: "center" }}>
          Enter your API key to unlock all AI tools. Get yours free at{" "}
          <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: C.indigo, textDecoration: "none", fontWeight: 600 }}>console.anthropic.com</a>
        </p>
        <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>API Key</label>
        <input type="password" placeholder="sk-ant-api03-..." value={k} onChange={ev => { setK(ev.target.value); setE(""); }} onKeyDown={ev => ev.key === "Enter" && (() => { if (!k.trim()) { setE("Enter your key"); return; } localStorage.setItem("hw_key", k.trim()); onSave(k.trim()); })()}
          style={{ width: "100%", padding: "0.82rem 1rem", borderRadius: 12, border: `1.5px solid ${e ? C.rose : t.border}`, background: t.input, color: t.text, fontSize: "0.95rem", outline: "none", boxSizing: "border-box", fontFamily: "monospace", marginBottom: "0.5rem" }} />
        {e && <p style={{ color: C.rose, fontSize: "0.8rem", marginBottom: "0.5rem" }}>⚠️ {e}</p>}
        <button onClick={() => { if (!k.trim()) { setE("Enter your key"); return; } localStorage.setItem("hw_key", k.trim()); onSave(k.trim()); }}
          style={{ width: "100%", padding: "0.82rem", borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontWeight: 800, fontSize: "1rem", boxShadow: `0 4px 20px ${C.indigo}45`, marginBottom: "0.75rem" }}>
          Launch Platform →
        </button>
        <button onClick={onLogout} style={{ width: "100%", padding: "0.5rem", background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: "0.82rem", textDecoration: "underline" }}>Sign out</button>
      </div>
    </div>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin, dark }) {
  const t = th(dark);
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(null);
  const [pendingCode, setPendingCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const inp = (ex = {}) => ({ width: "100%", padding: "0.78rem 1rem", borderRadius: 11, border: `1.5px solid ${t.border}`, background: t.input, color: t.text, fontSize: "0.9rem", outline: "none", boxSizing: "border-box", fontFamily: "inherit", ...ex });

  async function signup() {
    if (!name.trim() || !email.trim() || !pass.trim()) { setErr("All fields required"); return; }
    if (pass.length < 6) { setErr("Password must be 6+ characters"); return; }
    if (getUsers().find(u => u.email === email.toLowerCase())) { setErr("Email already registered"); return; }
    setLoading(true); setErr("");
    const vc = genCode();
    setPendingCode(vc);
    setPending({ name, email: email.toLowerCase(), password: hash(pass), verified: false });
    setInfo(`Verification code: ${vc}`);
    setLoading(false);
    setMode("verify");
  }

  function verify() {
    if (code.trim() !== pendingCode) { setErr("Incorrect code"); return; }
    const u = { ...pending, verified: true };
    saveUsers([...getUsers(), u]);
    onLogin(u);
  }

  function login() {
    if (!email.trim() || !pass.trim()) { setErr("Fill in all fields"); return; }
    const u = getUsers().find(x => x.email === email.toLowerCase() && x.password === hash(pass));
    if (!u) { setErr("Incorrect email or password"); return; }
    onLogin(u);
  }

  return (
    <div style={{ minHeight: "100vh", background: dark ? "linear-gradient(135deg,#0a0a0f,#12082a)" : "linear-gradient(135deg,#f0f0ff,#e8e4ff)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: "100%", maxWidth: 420, background: t.card, border: `1px solid ${t.border}`, borderRadius: 24, padding: "2.5rem", boxShadow: dark ? "0 30px 80px rgba(99,102,241,0.15)" : "0 30px 80px rgba(99,102,241,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(135deg,${C.indigo},${C.violet})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.85rem", boxShadow: `0 8px 24px ${C.indigo}45` }}>
            <span style={{ fontSize: "1.4rem" }}>✍️</span>
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", margin: "0 0 0.2rem" }}>HumanWrite AI</h1>
          <p style={{ color: t.muted, fontSize: "0.83rem", margin: 0 }}>Premium AI Writing Platform</p>
        </div>

        {mode !== "verify" && (
          <div style={{ display: "flex", background: t.card2, borderRadius: 12, padding: "0.22rem", marginBottom: "1.6rem", border: `1px solid ${t.border}` }}>
            {["login", "signup"].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, padding: "0.52rem", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.84rem", background: mode === m ? `linear-gradient(135deg,${C.indigo},${C.violet})` : "transparent", color: mode === m ? "#fff" : t.muted, transition: "all 0.15s" }}>
                {m === "login" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        {mode === "verify" && (
          <div style={{ textAlign: "center", marginBottom: "1.4rem" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.4rem" }}>📧</div>
            <h3 style={{ color: t.text, fontWeight: 800, marginBottom: "0.3rem" }}>Verify your email</h3>
            <p style={{ color: t.muted, fontSize: "0.85rem" }}>{info}</p>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          {mode === "signup" && (
            <div>
              <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.28rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Full Name</label>
              <input value={name} onChange={e => { setName(e.target.value); setErr(""); }} placeholder="John Smith" style={inp()} />
            </div>
          )}
          {mode !== "verify" && (
            <>
              <div>
                <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.28rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Email</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} placeholder="you@example.com" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.28rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Password</label>
                <input type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} placeholder="Min. 6 characters" onKeyDown={e => e.key === "Enter" && (mode === "login" ? login() : signup())} style={inp()} />
              </div>
            </>
          )}
          {mode === "verify" && (
            <div>
              <label style={{ fontSize: "0.68rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.28rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>6-Digit Code</label>
              <input value={code} onChange={e => { setCode(e.target.value); setErr(""); }} placeholder="123456" maxLength={6} onKeyDown={e => e.key === "Enter" && verify()} style={inp({ textAlign: "center", letterSpacing: "0.3em", fontWeight: 700, fontSize: "1.2rem", fontFamily: "monospace" })} />
            </div>
          )}
          {err && <div style={{ color: C.rose, fontSize: "0.82rem", padding: "0.55rem 0.85rem", borderRadius: 9, background: `${C.rose}12`, border: `1px solid ${C.rose}30` }}>⚠️ {err}</div>}
          <button onClick={mode === "login" ? login : mode === "signup" ? signup : verify} disabled={loading}
            style={{ padding: "0.82rem", borderRadius: 12, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontWeight: 800, fontSize: "1rem", boxShadow: `0 4px 20px ${C.indigo}45`, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
            {loading && <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />}
            {mode === "login" ? "Sign In →" : mode === "signup" ? "Create Account →" : "Verify & Continue →"}
          </button>
          {mode === "verify" && <button onClick={() => { setMode("signup"); setErr(""); }} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: "0.82rem", textDecoration: "underline" }}>← Back</button>}
        </div>
        <p style={{ textAlign: "center", color: t.muted, fontSize: "0.72rem", marginTop: "1.25rem" }}>🔒 Your data stays private. We never share your information.</p>
      </div>
    </div>
  );
}

// ── Tool: Humanizer ───────────────────────────────────────────────────────────
function Humanizer({ apiKey, dark }) {
  const t = th(dark);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState("Undetectable");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const modes = ["Academic", "Casual", "Professional", "Undetectable"];
  const wc = input.trim() ? input.trim().split(/\s+/).length : 0;

  async function run() {
    if (!input.trim() || loading) return;
    setLoading(true); setErr(""); setOutput("");
    try { setOutput(await callAI(PROMPTS.humanizer(mode), input, apiKey)); }
    catch (e) { setErr(e.message?.includes("401") ? "Invalid API key" : e.message || "Error occurred"); }
    setLoading(false);
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>AI Humanizer</h2>
        <p style={{ color: t.muted, fontSize: "0.88rem" }}>Transform AI-generated text into undetectable human writing</p>
      </div>

      {/* Mode Selector */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {modes.map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{ padding: "0.42rem 1rem", borderRadius: 999, border: `1.5px solid ${mode === m ? C.indigo : t.border}`, cursor: "pointer", fontWeight: 700, fontSize: "0.8rem", background: mode === m ? `${C.indigo}18` : t.card, color: mode === m ? C.indigo : t.muted, transition: "all 0.15s" }}>
            {m === "Undetectable" ? "🔥 " : ""}{m}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Input */}
        <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "0.65rem 1rem", borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Input Text</span>
            <span style={{ fontSize: "0.72rem", color: t.muted }}>{wc} words</span>
          </div>
          <textarea style={{ width: "100%", minHeight: 320, padding: "1rem", background: "transparent", border: "none", color: t.text, fontSize: "0.95rem", lineHeight: 1.75, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            placeholder="Paste your AI-generated text here..." value={input} onChange={e => setInput(e.target.value)} />
        </div>

        {/* Output */}
        <div style={{ background: output ? `${C.indigo}08` : t.card, border: `1.5px solid ${output ? C.indigo + "30" : t.border}`, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "0.65rem 1rem", borderBottom: `1px solid ${output ? C.indigo + "25" : t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: output ? C.indigo : t.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{output ? "✨ Humanized" : "Output"}</span>
            {output && <button onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding: "0.22rem 0.7rem", borderRadius: 7, border: `1px solid ${t.border}`, cursor: "pointer", background: copied ? `${C.emerald}18` : "transparent", color: copied ? C.emerald : t.muted, fontSize: "0.75rem", fontWeight: 600 }}>{copied ? "✓ Copied!" : "Copy"}</button>}
          </div>
          <div style={{ padding: "1rem", minHeight: 320, color: t.text, fontSize: "0.95rem", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
            {loading ? <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: t.muted, height: "100%", justifyContent: "center" }}><span style={{ width: 14, height: 14, border: `2px solid ${C.indigo}40`, borderTopColor: C.indigo, borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />Humanizing...</div>
              : output || <span style={{ color: t.muted, fontSize: "0.9rem" }}>Your humanized text will appear here...</span>}
          </div>
        </div>
      </div>

      {err && <div style={{ marginTop: "0.75rem", padding: "0.8rem 1rem", borderRadius: 12, background: `${C.rose}12`, border: `1px solid ${C.rose}35`, color: C.rose, fontSize: "0.87rem" }}>⚠️ {err}</div>}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.65rem", justifyContent: "center" }}>
        <button onClick={run} disabled={loading || !input.trim()} style={{ padding: "0.72rem 2.5rem", borderRadius: 12, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", background: loading || !input.trim() ? t.card2 : `linear-gradient(135deg,${C.indigo},${C.violet})`, color: loading || !input.trim() ? t.muted : "#fff", fontWeight: 800, fontSize: "0.95rem", boxShadow: loading || !input.trim() ? "none" : `0 4px 20px ${C.indigo}40` }}>
          {loading ? "Humanizing..." : `✨ Humanize (${mode})`}
        </button>
        {input && <button onClick={() => { setInput(""); setOutput(""); setErr(""); }} style={{ padding: "0.72rem 1.25rem", borderRadius: 12, border: `1px solid ${t.border}`, cursor: "pointer", background: "transparent", color: t.muted, fontWeight: 600, fontSize: "0.88rem" }}>Clear</button>}
      </div>

      {/* Trust badges */}
      <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem", flexWrap: "wrap" }}>
        {["Bypasses Turnitin", "Bypasses GPTZero", "Bypasses Originality.ai", "Bypasses Winston AI"].map(b => (
          <div key={b} style={{ fontSize: "0.75rem", color: t.muted, display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ color: C.emerald, fontSize: "0.7rem" }}>✓</span> {b}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tool: Detector ────────────────────────────────────────────────────────────
function Detector({ apiKey, dark }) {
  const t = th(dark);
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (!input.trim() || loading) return;
    setLoading(true); setErr(""); setResult(null);
    try { setResult(parseJSON(await callAI(PROMPTS.detector, input, apiKey))); }
    catch (e) { setErr(e.message?.includes("401") ? "Invalid API key" : e.message || "Error occurred"); }
    setLoading(false);
  }

  const p = result?.aiScore ?? 0;
  const col = p >= 70 ? C.rose : p >= 40 ? C.amber : C.emerald;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>AI Detector</h2>
        <p style={{ color: t.muted, fontSize: "0.88rem" }}>Advanced multi-layer AI content detection with sentence-level analysis</p>
      </div>

      <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, overflow: "hidden", marginBottom: "1rem" }}>
        <div style={{ padding: "0.65rem 1rem", borderBottom: `1px solid ${t.border}` }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Paste text to analyze</span>
        </div>
        <textarea style={{ width: "100%", minHeight: 200, padding: "1rem", background: "transparent", border: "none", color: t.text, fontSize: "0.95rem", lineHeight: 1.75, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          placeholder="Paste any text here to check if it was written by AI..." value={input} onChange={e => setInput(e.target.value)} />
        <div style={{ padding: "0.65rem 1rem", borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: t.muted }}>{input.trim() ? input.trim().split(/\s+/).length : 0} words</span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {input && <button onClick={() => { setInput(""); setResult(null); }} style={{ padding: "0.4rem 0.85rem", borderRadius: 9, border: `1px solid ${t.border}`, cursor: "pointer", background: "transparent", color: t.muted, fontSize: "0.8rem" }}>Clear</button>}
            <button onClick={run} disabled={loading || !input.trim()} style={{ padding: "0.4rem 1.4rem", borderRadius: 9, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", background: loading || !input.trim() ? t.card2 : `linear-gradient(135deg,${C.indigo},${C.violet})`, color: loading || !input.trim() ? t.muted : "#fff", fontWeight: 700, fontSize: "0.88rem" }}>
              {loading ? "Analyzing..." : "🔍 Analyze"}
            </button>
          </div>
        </div>
      </div>

      {err && <div style={{ padding: "0.8rem 1rem", borderRadius: 12, background: `${C.rose}12`, border: `1px solid ${C.rose}35`, color: C.rose, fontSize: "0.87rem", marginBottom: "1rem" }}>⚠️ {err}</div>}

      {result && (
        <div>
          {/* Score */}
          <div style={{ padding: "2rem", borderRadius: 20, background: t.card, border: `2px solid ${col}30`, textAlign: "center", marginBottom: "1rem" }}>
            <div style={{ fontSize: "5rem", fontWeight: 900, color: col, lineHeight: 1, letterSpacing: "-0.03em" }}>{p}%</div>
            <div style={{ fontSize: "0.75rem", color: t.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0.3rem 0 0.75rem" }}>AI Probability Score</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.42rem 1.3rem", borderRadius: 999, background: `${col}15`, border: `1px solid ${col}35` }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, display: "inline-block", boxShadow: `0 0 8px ${col}` }} />
              <span style={{ color: col, fontWeight: 800, fontSize: "0.9rem" }}>{result.verdict}</span>
              <span style={{ color: t.muted, fontSize: "0.78rem" }}>· {result.confidence} confidence</span>
            </div>
            <div style={{ marginTop: "1.25rem", height: 10, borderRadius: 999, background: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${p}%`, borderRadius: 999, background: `linear-gradient(90deg,${C.emerald},${col})`, transition: "width 1.2s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem" }}>
              <span style={{ fontSize: "0.68rem", color: C.emerald, fontWeight: 600 }}>Human Written</span>
              <span style={{ fontSize: "0.68rem", color: C.rose, fontWeight: 600 }}>AI Generated</span>
            </div>
          </div>

          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
            {[["Perplexity", result.perplexity], ["Burstiness", result.burstiness], ["Stylometry", result.stylometry?.split(" ")[0] || "—"]].map(([name, val]) => {
              const vc = val === "Low" || val === "Uniform" ? C.rose : val === "Medium" || val === "Slightly" ? C.amber : C.emerald;
              return (
                <div key={name} style={{ padding: "0.9rem", borderRadius: 14, background: t.card, border: `1px solid ${t.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 900, color: vc }}>{val || "—"}</div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.text, marginTop: "0.1rem" }}>{name}</div>
                  <div style={{ fontSize: "0.63rem", color: t.muted }}>Low = AI-like</div>
                </div>
              );
            })}
          </div>

          {/* AI Words */}
          {result.aiWords?.length > 0 && (
            <div style={{ padding: "0.85rem 1rem", borderRadius: 12, background: `${C.rose}10`, border: `1px solid ${C.rose}28`, marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.rose, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>🚨 AI Vocabulary Detected</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                {result.aiWords.map((w, i) => <span key={i} style={{ padding: "0.15rem 0.55rem", borderRadius: 6, background: `${C.rose}18`, color: C.rose, fontSize: "0.77rem", fontWeight: 600 }}>{w}</span>)}
              </div>
            </div>
          )}

          {/* Summary */}
          {result.summary && (
            <div style={{ padding: "1rem 1.15rem", borderRadius: 14, background: `${C.indigo}08`, border: `1px solid ${C.indigo}20`, marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.indigo, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.4rem" }}>Analysis</div>
              <div style={{ fontSize: "0.9rem", color: t.text, lineHeight: 1.72 }}>{result.summary}</div>
            </div>
          )}

          {/* Sentence-level */}
          {result.sentences?.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.6rem" }}>Sentence-Level Analysis</div>
              {result.sentences.map((s, i) => {
                const sc = s.risk === "high" ? C.rose : s.risk === "medium" ? C.amber : C.emerald;
                return (
                  <div key={i} style={{ padding: "0.65rem 0.9rem", borderRadius: 10, marginBottom: "0.38rem", background: t.card, borderLeft: `3px solid ${sc}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div style={{ fontSize: "0.83rem", color: t.text, flex: 1 }}>"{s.text}..."</div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.15rem", flexShrink: 0 }}>
                      <span style={{ fontSize: "0.63rem", fontWeight: 700, padding: "0.08rem 0.45rem", borderRadius: 6, background: `${sc}20`, color: sc, textTransform: "uppercase" }}>{s.risk}</span>
                      <span style={{ fontSize: "0.7rem", color: t.muted }}>{s.reason}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Signals */}
          {result.signals?.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.55rem" }}>⚠️ AI Signals ({result.signals.length})</div>
              {result.signals.map((s, i) => {
                const sc = s.severity === "high" ? C.rose : s.severity === "medium" ? C.amber : C.sky;
                return (
                  <div key={i} style={{ padding: "0.62rem 0.9rem", borderRadius: 10, marginBottom: "0.38rem", background: t.card, borderLeft: `3px solid ${sc}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.15rem" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.82rem", color: t.text }}>{s.label}</span>
                      <span style={{ fontSize: "0.63rem", fontWeight: 700, padding: "0.08rem 0.45rem", borderRadius: 6, background: `${sc}20`, color: sc, textTransform: "uppercase" }}>{s.severity}</span>
                    </div>
                    <div style={{ fontSize: "0.77rem", color: t.muted }}>{s.detail}</div>
                  </div>
                );
              })}
            </div>
          )}

          {result.recommendation && <div style={{ padding: "0.9rem 1.1rem", borderRadius: 12, background: `${col}10`, border: `1px solid ${col}28`, color: col, fontSize: "0.87rem", fontWeight: 600 }}>💡 {result.recommendation}</div>}

          {/* Trust Disclaimer */}
          <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: 12, background: t.card2, border: `1px solid ${t.border}`, fontSize: "0.75rem", color: t.muted, lineHeight: 1.5 }}>
            ⚠️ <strong style={{ color: t.text }}>Disclaimer:</strong> AI detection is probabilistic, not definitive. Results should be used as guidance only. No detector achieves 100% accuracy.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tool: Paraphraser ─────────────────────────────────────────────────────────
function Paraphraser({ apiKey, dark }) {
  const t = th(dark);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [style, setStyle] = useState("Standard");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const styles = ["Standard", "Formal", "Simple", "Creative", "Fluency"];

  async function run() {
    if (!input.trim() || loading) return;
    setLoading(true); setErr(""); setOutput("");
    try { setOutput(await callAI(PROMPTS.paraphraser(style), input, apiKey)); }
    catch (e) { setErr(e.message?.includes("401") ? "Invalid API key" : e.message || "Error"); }
    setLoading(false);
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>Paraphraser</h2>
        <p style={{ color: t.muted, fontSize: "0.88rem" }}>Rewrite any text in multiple styles while preserving meaning</p>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {styles.map(s => <button key={s} onClick={() => setStyle(s)} style={{ padding: "0.42rem 1rem", borderRadius: 999, border: `1.5px solid ${style === s ? C.violet : t.border}`, cursor: "pointer", fontWeight: 700, fontSize: "0.8rem", background: style === s ? `${C.violet}18` : t.card, color: style === s ? C.violet : t.muted }}>{s}</button>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "0.65rem 1rem", borderBottom: `1px solid ${t.border}` }}><span style={{ fontSize: "0.75rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>Original</span></div>
          <textarea style={{ width: "100%", minHeight: 280, padding: "1rem", background: "transparent", border: "none", color: t.text, fontSize: "0.95rem", lineHeight: 1.75, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} placeholder="Paste text to paraphrase..." value={input} onChange={e => setInput(e.target.value)} />
        </div>
        <div style={{ background: output ? `${C.violet}08` : t.card, border: `1.5px solid ${output ? C.violet + "30" : t.border}`, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ padding: "0.65rem 1rem", borderBottom: `1px solid ${output ? C.violet + "25" : t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: output ? C.violet : t.muted, textTransform: "uppercase", letterSpacing: "0.07em" }}>{output ? "🔁 Paraphrased" : "Output"}</span>
            {output && <button onClick={() => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding: "0.22rem 0.7rem", borderRadius: 7, border: `1px solid ${t.border}`, cursor: "pointer", background: copied ? `${C.emerald}18` : "transparent", color: copied ? C.emerald : t.muted, fontSize: "0.75rem", fontWeight: 600 }}>{copied ? "✓" : "Copy"}</button>}
          </div>
          <div style={{ padding: "1rem", minHeight: 280, color: t.text, fontSize: "0.95rem", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
            {loading ? <div style={{ color: t.muted, textAlign: "center", paddingTop: "3rem" }}>Paraphrasing...</div> : output || <span style={{ color: t.muted }}>Paraphrased text appears here...</span>}
          </div>
        </div>
      </div>
      {err && <div style={{ marginTop: "0.75rem", padding: "0.8rem 1rem", borderRadius: 12, background: `${C.rose}12`, border: `1px solid ${C.rose}35`, color: C.rose, fontSize: "0.87rem" }}>⚠️ {err}</div>}
      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center", gap: "0.65rem" }}>
        <button onClick={run} disabled={loading || !input.trim()} style={{ padding: "0.72rem 2.5rem", borderRadius: 12, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", background: loading || !input.trim() ? t.card2 : `linear-gradient(135deg,${C.violet},${C.indigo})`, color: loading || !input.trim() ? t.muted : "#fff", fontWeight: 800, fontSize: "0.95rem", boxShadow: loading || !input.trim() ? "none" : `0 4px 20px ${C.violet}40` }}>
          {loading ? "Paraphrasing..." : `🔁 Paraphrase (${style})`}
        </button>
      </div>
    </div>
  );
}

// ── Tool: Grammar ─────────────────────────────────────────────────────────────
function Grammar({ apiKey, dark }) {
  const t = th(dark);
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [fixing, setFixing] = useState(false);

  async function run() {
    if (!input.trim() || loading) return;
    setLoading(true); setErr(""); setResult(null);
    try { setResult(parseJSON(await callAI(PROMPTS.grammar, input, apiKey))); }
    catch (e) { setErr(e.message?.includes("401") ? "Invalid API key" : e.message || "Error"); }
    setLoading(false);
  }

  async function fixAll() {
    if (!result?.corrected) return;
    setFixing(true);
    setInput(result.corrected);
    setResult(null);
    try { setResult(parseJSON(await callAI(PROMPTS.grammar, result.corrected, apiKey))); }
    catch { }
    setFixing(false);
  }

  const sc = result?.score >= 80 ? C.emerald : result?.score >= 60 ? C.amber : C.rose;

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>Grammar Checker</h2>
        <p style={{ color: t.muted, fontSize: "0.88rem" }}>Professional grammar, spelling, and style analysis with auto-fix</p>
      </div>
      <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, overflow: "hidden", marginBottom: "1rem" }}>
        <textarea style={{ width: "100%", minHeight: 200, padding: "1rem", background: "transparent", border: "none", color: t.text, fontSize: "0.95rem", lineHeight: 1.75, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} placeholder="Paste text to check grammar..." value={input} onChange={e => setInput(e.target.value)} />
        <div style={{ padding: "0.65rem 1rem", borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: t.muted }}>{input.trim() ? input.trim().split(/\s+/).length : 0} words</span>
          <button onClick={run} disabled={loading || !input.trim()} style={{ padding: "0.42rem 1.4rem", borderRadius: 9, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", background: loading || !input.trim() ? t.card2 : `linear-gradient(135deg,${C.emerald},#059669)`, color: loading || !input.trim() ? t.muted : "#fff", fontWeight: 700, fontSize: "0.88rem" }}>
            {loading ? "Checking..." : "✅ Check Grammar"}
          </button>
        </div>
      </div>
      {err && <div style={{ padding: "0.8rem 1rem", borderRadius: 12, background: `${C.rose}12`, border: `1px solid ${C.rose}35`, color: C.rose, fontSize: "0.87rem", marginBottom: "1rem" }}>⚠️ {err}</div>}
      {result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <div style={{ padding: "0.5rem 1.25rem", borderRadius: 12, background: `${sc}18`, border: `1px solid ${sc}45`, color: sc, fontWeight: 900, fontSize: "1.15rem" }}>{result.score}/100</div>
            <div style={{ flex: 1, color: t.muted, fontSize: "0.85rem" }}><strong style={{ color: t.text }}>{result.issues?.length || 0} issues found</strong> · {result.summary}</div>
            {result.issues?.length > 0 && (
              <button onClick={fixAll} disabled={fixing} style={{ padding: "0.5rem 1.2rem", borderRadius: 10, border: "none", cursor: fixing ? "not-allowed" : "pointer", background: `linear-gradient(135deg,${C.emerald},#059669)`, color: "#fff", fontWeight: 700, fontSize: "0.84rem", display: "flex", alignItems: "center", gap: "0.38rem" }}>
                {fixing ? "Fixing..." : "✓ Fix All Errors"}
              </button>
            )}
          </div>
          {result.corrected && (
            <div style={{ padding: "1.2rem", borderRadius: 16, background: `${C.emerald}07`, border: `1px solid ${C.emerald}28`, marginBottom: "1rem", lineHeight: 1.82, whiteSpace: "pre-wrap", fontSize: "0.94rem", color: t.text }}>
              <div style={{ fontSize: "0.67rem", fontWeight: 700, color: C.emerald, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.45rem" }}>✓ Corrected Version</div>
              {result.corrected}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
            {(result.issues || []).map((iss, i) => {
              const cc = iss.severity === "critical" ? C.rose : iss.severity === "major" ? C.amber : C.sky;
              return (
                <div key={i} style={{ padding: "0.78rem 1rem", borderRadius: 12, background: t.card, borderLeft: `3px solid ${cc}` }}>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.22rem" }}>
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, padding: "0.1rem 0.48rem", borderRadius: 6, background: `${cc}20`, color: cc, textTransform: "uppercase" }}>{iss.severity}</span>
                    <span style={{ fontSize: "0.62rem", fontWeight: 700, padding: "0.1rem 0.48rem", borderRadius: 6, background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)", color: t.muted, textTransform: "uppercase" }}>{iss.type}</span>
                    <span style={{ fontSize: "0.82rem", color: dark ? "#bbb" : "#666", fontStyle: "italic" }}>"{iss.original}"</span>
                    <span style={{ color: t.muted }}>→</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: C.emerald }}>"{iss.suggestion}"</span>
                  </div>
                  <div style={{ fontSize: "0.77rem", color: t.muted }}>{iss.explanation}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tool: Essay ───────────────────────────────────────────────────────────────
function EssayGenerator({ apiKey, dark }) {
  const t = th(dark);
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("Argumentative");
  const [length, setLength] = useState("500");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const types = ["Argumentative", "Analytical", "Expository", "Descriptive", "Research"];

  async function run() {
    if (!topic.trim() || loading) return;
    setLoading(true); setErr(""); setResult(null);
    const prompt = `Topic: ${topic}\nEssay Type: ${type}\nTarget Length: ${length} words\nGenerate a complete, original, well-structured essay.`;
    try { setResult(parseJSON(await callAI(PROMPTS.essay, prompt, apiKey, 2500))); }
    catch (e) { setErr(e.message?.includes("401") ? "Invalid API key" : e.message || "Error"); }
    setLoading(false);
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>Essay Generator</h2>
        <p style={{ color: t.muted, fontSize: "0.88rem" }}>Generate structured academic essays with thesis, outline, and citations</p>
      </div>
      <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, padding: "1.5rem", marginBottom: "1rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Essay Topic</label>
          <textarea value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. The impact of social media on mental health in teenagers..." style={{ width: "100%", padding: "0.85rem 1rem", borderRadius: 12, border: `1.5px solid ${t.border}`, background: t.input, color: t.text, fontSize: "0.95rem", lineHeight: 1.6, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box", minHeight: 80 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Essay Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
              {types.map(tp => <button key={tp} onClick={() => setType(tp)} style={{ padding: "0.38rem 0.85rem", borderRadius: 999, border: `1.5px solid ${type === tp ? C.amber : t.border}`, cursor: "pointer", fontWeight: 600, fontSize: "0.78rem", background: type === tp ? `${C.amber}18` : "transparent", color: type === tp ? C.amber : t.muted }}>{tp}</button>)}
            </div>
          </div>
          <div>
            <label style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, display: "block", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Word Count: {length}</label>
            <input type="range" min="300" max="2000" step="100" value={length} onChange={e => setLength(e.target.value)} style={{ width: "100%" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: t.muted, marginTop: "0.2rem" }}><span>300</span><span>2000</span></div>
          </div>
        </div>
        <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <button onClick={run} disabled={loading || !topic.trim()} style={{ padding: "0.72rem 2.5rem", borderRadius: 12, border: "none", cursor: loading || !topic.trim() ? "not-allowed" : "pointer", background: loading || !topic.trim() ? t.card2 : `linear-gradient(135deg,${C.amber},${C.indigo})`, color: loading || !topic.trim() ? t.muted : "#fff", fontWeight: 800, fontSize: "0.95rem", boxShadow: loading || !topic.trim() ? "none" : `0 4px 20px ${C.amber}35` }}>
            {loading ? "Generating essay..." : "📄 Generate Essay"}
          </button>
        </div>
      </div>
      {err && <div style={{ padding: "0.8rem 1rem", borderRadius: 12, background: `${C.rose}12`, border: `1px solid ${C.rose}35`, color: C.rose, fontSize: "0.87rem", marginBottom: "1rem" }}>⚠️ {err}</div>}
      {result && (
        <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 900, color: t.text, marginBottom: "0.3rem" }}>{result.title}</h3>
              <div style={{ fontSize: "0.82rem", color: t.muted }}>{result.wordCount} words · {type}</div>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(result.essay); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding: "0.42rem 1rem", borderRadius: 9, border: `1px solid ${t.border}`, cursor: "pointer", background: copied ? `${C.emerald}18` : "transparent", color: copied ? C.emerald : t.muted, fontWeight: 600, fontSize: "0.82rem" }}>{copied ? "✓ Copied!" : "Copy Essay"}</button>
          </div>
          {result.thesis && <div style={{ padding: "0.85rem 1rem", borderRadius: 12, background: `${C.amber}10`, border: `1px solid ${C.amber}28`, marginBottom: "1rem" }}><div style={{ fontSize: "0.67rem", fontWeight: 700, color: C.amber, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>Thesis</div><div style={{ fontSize: "0.9rem", color: t.text, fontStyle: "italic" }}>{result.thesis}</div></div>}
          {result.outline?.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>Outline</div>
              {result.outline.map((item, i) => <div key={i} style={{ padding: "0.42rem 0.75rem", borderRadius: 8, marginBottom: "0.3rem", background: t.card2, fontSize: "0.85rem", color: t.text, display: "flex", gap: "0.5rem" }}><span style={{ color: C.indigo, fontWeight: 700 }}>{i + 1}.</span>{item}</div>)}
            </div>
          )}
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>Full Essay</div>
          <div style={{ fontSize: "0.93rem", color: t.text, lineHeight: 1.82, whiteSpace: "pre-wrap", padding: "1rem", borderRadius: 12, background: t.card2, maxHeight: 400, overflowY: "auto" }}>{result.essay}</div>
          {result.citations?.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.5rem" }}>Suggested Citations</div>
              {result.citations.map((c, i) => <div key={i} style={{ fontSize: "0.82rem", color: t.muted, padding: "0.3rem 0", borderBottom: `1px solid ${t.border}` }}>[{i + 1}] {c}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool: Summarizer ──────────────────────────────────────────────────────────
function Summarizer({ apiKey, dark }) {
  const t = th(dark);
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    if (!input.trim() || loading) return;
    setLoading(true); setErr(""); setResult(null);
    try { setResult(parseJSON(await callAI(PROMPTS.summarizer, input, apiKey))); }
    catch (e) { setErr(e.message?.includes("401") ? "Invalid API key" : e.message || "Error"); }
    setLoading(false);
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 900, color: t.text, letterSpacing: "-0.02em", marginBottom: "0.3rem" }}>Summarizer</h2>
        <p style={{ color: t.muted, fontSize: "0.88rem" }}>Condense any text into key points and concise summaries</p>
      </div>
      <div style={{ background: t.card, border: `1.5px solid ${t.border}`, borderRadius: 18, overflow: "hidden", marginBottom: "1rem" }}>
        <textarea style={{ width: "100%", minHeight: 200, padding: "1rem", background: "transparent", border: "none", color: t.text, fontSize: "0.95rem", lineHeight: 1.75, resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} placeholder="Paste long text to summarize..." value={input} onChange={e => setInput(e.target.value)} />
        <div style={{ padding: "0.65rem 1rem", borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: t.muted }}>{input.trim() ? input.trim().split(/\s+/).length : 0} words</span>
          <button onClick={run} disabled={loading || !input.trim()} style={{ padding: "0.42rem 1.4rem", borderRadius: 9, border: "none", cursor: loading || !input.trim() ? "not-allowed" : "pointer", background: loading || !input.trim() ? t.card2 : `linear-gradient(135deg,${C.sky},#0284c7)`, color: loading || !input.trim() ? t.muted : "#fff", fontWeight: 700, fontSize: "0.88rem" }}>
            {loading ? "Summarizing..." : "⚡ Summarize"}
          </button>
        </div>
      </div>
      {err && <div style={{ padding: "0.8rem 1rem", borderRadius: 12, background: `${C.rose}12`, border: `1px solid ${C.rose}35`, color: C.rose, fontSize: "0.87rem", marginBottom: "1rem" }}>⚠️ {err}</div>}
      {result && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
            {[["Words Saved", result.wordCount?.reduction || "—", C.sky], ["Sentiment", result.sentiment, result.sentiment === "Positive" ? C.emerald : result.sentiment === "Negative" ? C.rose : C.amber], ["Theme", result.mainTheme?.slice(0, 20) + "...", C.violet]].map(([l, v, c]) => (
              <div key={l} style={{ padding: "0.9rem", borderRadius: 14, background: t.card, border: `1px solid ${t.border}`, textAlign: "center" }}>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: c }}>{v}</div>
                <div style={{ fontSize: "0.7rem", color: t.muted, marginTop: "0.1rem" }}>{l}</div>
              </div>
            ))}
          </div>
          {result.summary && (
            <div style={{ padding: "1.2rem", borderRadius: 16, background: `${C.sky}08`, border: `1px solid ${C.sky}28`, marginBottom: "1rem", lineHeight: 1.82, fontSize: "0.94rem", color: t.text }}>
              <div style={{ fontSize: "0.67rem", fontWeight: 700, color: C.sky, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.45rem" }}>Summary</div>
              {result.summary}
            </div>
          )}
          {result.keyPoints?.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.55rem" }}>Key Points</div>
              {result.keyPoints.map((pt, i) => (
                <div key={i} style={{ display: "flex", gap: "0.6rem", padding: "0.55rem 0.9rem", borderRadius: 10, marginBottom: "0.38rem", background: `${C.sky}07`, border: `1px solid ${C.sky}20` }}>
                  <span style={{ color: C.sky, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                  <span style={{ fontSize: "0.88rem", color: t.text }}>{pt}</span>
                </div>
              ))}
            </div>
          )}
          {result.topics?.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {result.topics.map((tp, i) => <span key={i} style={{ padding: "0.2rem 0.7rem", borderRadius: 999, background: `${C.violet}12`, border: `1px solid ${C.violet}28`, color: C.violet, fontSize: "0.77rem", fontWeight: 600 }}>{tp}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Support Chat ──────────────────────────────────────────────────────────────
function SupportChat({ apiKey, dark, currentTool, onClose }) {
  const t = th(dark);
  const [msgs, setMsgs] = useState([
    { role: "assistant", text: `Hi! 👋 I'm your HumanWrite AI assistant. I see you're using the ${currentTool}. How can I help you today?` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const bottomRef = useRef();
  const fileRef = useRef();

  async function send() {
    const msg = input.trim();
    if (!msg && !file) return;
    const userMsg = file ? `${msg} [File: ${file.name}]` : msg;
    setMsgs(prev => [...prev, { role: "user", text: userMsg }]);
    setInput(""); setFile(null); setLoading(true);
    try {
      const history = msgs.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n");
      const contextPrompt = `${PROMPTS.support}\n\nCurrent tool the user is on: ${currentTool}`;
      const reply = await callAI(contextPrompt, `${history}\nUser: ${userMsg}`, apiKey);
      setMsgs(prev => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setMsgs(prev => [...prev, { role: "assistant", text: "Sorry, I'm having a technical issue right now. Please try again!" }]);
    }
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  return (
    <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", width: 380, maxWidth: "calc(100vw - 2rem)", zIndex: 999, borderRadius: 22, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,0.45)", border: `1px solid ${t.border}` }}>
      <div style={{ background: `linear-gradient(135deg,${C.indigo},${C.violet})`, padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>🤖</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: "0.88rem" }}>HumanWrite Support</div>
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: "0.68rem" }}>● Online · Instant responses</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", borderRadius: 7, padding: "0.28rem 0.6rem", fontSize: "1rem", fontWeight: 700 }}>✕</button>
      </div>
      <div style={{ background: t.card, height: 320, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "84%", padding: "0.62rem 0.9rem", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.role === "user" ? `linear-gradient(135deg,${C.indigo},${C.violet})` : t.card2, color: m.role === "user" ? "#fff" : t.text, fontSize: "0.85rem", lineHeight: 1.6, border: m.role === "assistant" ? `1px solid ${t.border}` : "none" }}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div style={{ display: "flex" }}><div style={{ padding: "0.62rem 1rem", borderRadius: "16px 16px 16px 4px", background: t.card2, border: `1px solid ${t.border}` }}><span style={{ display: "inline-flex", gap: "0.2rem" }}>{[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: C.indigo, display: "inline-block", animation: `bounce 1.2s ${i*0.18}s infinite` }} />)}</span></div></div>}
        <div ref={bottomRef} />
      </div>
      {file && <div style={{ background: t.card2, padding: "0.4rem 1rem", borderTop: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: "0.76rem", color: t.muted }}>📎 {file.name}</span><button onClick={() => setFile(null)} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer" }}>✕</button></div>}
      <div style={{ background: t.card, borderTop: `1px solid ${t.border}`, padding: "0.65rem", display: "flex", gap: "0.42rem", alignItems: "flex-end" }}>
        <input type="file" ref={fileRef} style={{ display: "none" }} onChange={e => setFile(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} style={{ padding: "0.48rem", borderRadius: 8, border: `1px solid ${t.border}`, background: "transparent", color: t.muted, cursor: "pointer", fontSize: "1rem", flexShrink: 0 }}>📎</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask anything..." style={{ flex: 1, padding: "0.55rem 0.82rem", borderRadius: 10, border: `1px solid ${t.border}`, background: t.card2, color: t.text, fontSize: "0.87rem", outline: "none", fontFamily: "inherit" }} />
        <button onClick={send} disabled={loading || (!input.trim() && !file)} style={{ padding: "0.5rem 0.9rem", borderRadius: 9, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontWeight: 700, fontSize: "0.84rem", flexShrink: 0, opacity: loading || (!input.trim() && !file) ? 0.5 : 1 }}>Send</button>
      </div>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
function Landing({ onStart, dark, setDark }) {
  const t = th(dark);

  const stats = [
    { val: "100K+", label: "Students trust us" },
    { val: "1M+", label: "Texts improved" },
    { val: "95%", label: "Humanization success" },
    { val: "99%", label: "Accuracy rate" },
  ];

  const features = [
    { icon: "✍️", title: "AI Humanizer", desc: "Transform AI text into natural, undetectable human writing with 4 specialized modes", color: C.indigo },
    { icon: "🔍", title: "AI Detector", desc: "Advanced multi-layer detection using perplexity, burstiness & stylometry analysis", color: C.violet },
    { icon: "🔁", title: "Paraphraser", desc: "Rewrite in 5 styles — Standard, Formal, Simple, Creative, and Fluency optimized", color: C.sky },
    { icon: "✅", title: "Grammar Checker", desc: "Professional-grade editing with auto-fix, readability scores and style improvements", color: C.emerald },
    { icon: "📄", title: "Essay Generator", desc: "Structured academic essays with thesis, outline, and suggested citations", color: C.amber },
    { icon: "📚", title: "Summarizer", desc: "Intelligent summaries with key points, topic extraction and sentiment analysis", color: "#ec4899" },
  ];

  const testimonials = [
    { name: "Sarah K.", role: "University Student", text: "HumanWrite AI saved my dissertation. The Undetectable mode is genuinely impressive — no AI detector flags it.", rating: 5 },
    { name: "James M.", role: "Content Manager", text: "The best AI writing platform I've used. The grammar checker alone is worth the subscription price.", rating: 5 },
    { name: "Priya S.", role: "PhD Researcher", text: "The academic humanizer mode perfectly maintains scholarly tone while making text sound genuinely human.", rating: 5 },
  ];

  const plans = [
    { name: "Free", price: "£0", period: "/forever", features: ["300 words/day", "Basic Humanizer", "AI Detector (limited)", "Grammar Checker"], cta: "Get Started Free", stripe: null, popular: false },
    { name: "Monthly", price: "£15", period: "/month", features: ["Unlimited words", "All 6 tools", "Undetectable Mode", "Priority processing", "Export Word/PDF", "24/7 AI support"], cta: "Start Monthly", stripe: STRIPE.monthly, popular: true },
    { name: "Yearly", price: "£100", period: "/year", features: ["Everything in Monthly", "Save £80 vs monthly", "Early access features", "Dedicated support", "Student discount available"], cta: "Best Value", stripe: STRIPE.yearly, popular: false },
  ];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: t.nav, backdropFilter: "blur(24px)", borderBottom: `1px solid ${t.border}`, height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2rem" }}>
        <div style={{ fontWeight: 900, fontSize: "1.3rem", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.025em" }}>HumanWrite AI</div>
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <a href="#features" style={{ padding: "0.34rem 0.9rem", borderRadius: 8, color: t.muted, fontSize: "0.83rem", fontWeight: 600, textDecoration: "none" }}>Features</a>
          <a href="#pricing" style={{ padding: "0.34rem 0.9rem", borderRadius: 8, color: t.muted, fontSize: "0.83rem", fontWeight: 600, textDecoration: "none" }}>Pricing</a>
          <button onClick={() => setDark(!dark)} style={{ padding: "0.34rem 0.62rem", borderRadius: 8, border: "none", cursor: "pointer", background: dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)", fontSize: "0.93rem" }}>{dark ? "☀️" : "🌙"}</button>
          <button onClick={onStart} style={{ padding: "0.42rem 1.2rem", borderRadius: 10, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontWeight: 700, fontSize: "0.83rem", boxShadow: `0 4px 16px ${C.indigo}38` }}>Get Started →</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "6rem 1.5rem 4rem", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 1rem", borderRadius: 999, background: `${C.indigo}15`, border: `1px solid ${C.indigo}35`, color: C.indigo, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "1.5rem" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.emerald, display: "inline-block" }} />
          Trusted by 100,000+ students & professionals
        </div>
        <h1 style={{ fontSize: "clamp(2.4rem,6vw,4.5rem)", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.035em", marginBottom: "1.25rem" }}>
          The #1 AI Writing<br />
          <span style={{ background: `linear-gradient(135deg,${C.indigo},${C.violet},${C.sky})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Platform for Students
          </span>
        </h1>
        <p style={{ fontSize: "1.15rem", color: t.muted, maxWidth: 580, margin: "0 auto 2.5rem", lineHeight: 1.7 }}>
          Humanize AI text, detect AI content, fix grammar, generate essays, and more — all in one premium platform trusted by over 100,000 students and professionals.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onStart} style={{ padding: "0.85rem 2.25rem", borderRadius: 14, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontWeight: 800, fontSize: "1.05rem", boxShadow: `0 8px 28px ${C.indigo}45` }}>Start for Free →</button>
          <a href="#features" style={{ padding: "0.85rem 2.25rem", borderRadius: 14, border: `1.5px solid ${t.border}`, cursor: "pointer", background: "transparent", color: t.text, fontWeight: 600, fontSize: "1.05rem", textDecoration: "none" }}>See Features</a>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem", maxWidth: 900, margin: "0 auto 6rem", padding: "0 1.5rem" }}>
        {stats.map(s => (
          <div key={s.val} style={{ padding: "1.5rem", borderRadius: 18, background: t.card, border: `1px solid ${t.border}`, textAlign: "center" }}>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, background: `linear-gradient(135deg,${C.indigo},${C.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.03em" }}>{s.val}</div>
            <div style={{ fontSize: "0.85rem", color: t.muted, marginTop: "0.3rem" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div id="features" style={{ maxWidth: 1100, margin: "0 auto 6rem", padding: "0 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "0.75rem" }}>Everything you need to write better</h2>
          <p style={{ color: t.muted, fontSize: "1rem", maxWidth: 480, margin: "0 auto" }}>6 powerful AI tools in one platform, designed for students and professionals</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "1.25rem" }}>
          {features.map(f => (
            <div key={f.title} style={{ padding: "1.75rem", borderRadius: 20, background: t.card, border: `1px solid ${t.border}`, transition: "all 0.2s" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${f.color}18`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", marginBottom: "0.85rem", border: `1px solid ${f.color}30` }}>{f.icon}</div>
              <h3 style={{ fontWeight: 800, fontSize: "1rem", marginBottom: "0.4rem", color: t.text }}>{f.title}</h3>
              <p style={{ fontSize: "0.87rem", color: t.muted, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Before/After */}
      <div style={{ maxWidth: 900, margin: "0 auto 6rem", padding: "0 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.5rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>See the difference</h2>
          <p style={{ color: t.muted }}>Real before and after examples from our AI Humanizer</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          <div style={{ padding: "1.5rem", borderRadius: 18, background: `${C.rose}08`, border: `1px solid ${C.rose}25` }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.rose, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>❌ AI-Generated (Before)</div>
            <p style={{ fontSize: "0.88rem", color: t.text, lineHeight: 1.75, fontStyle: "italic" }}>"The utilization of artificial intelligence in modern educational environments has demonstrated significant potential for enhancing student learning outcomes. Furthermore, it is important to note that these technological advancements necessitate careful consideration of ethical implications."</p>
          </div>
          <div style={{ padding: "1.5rem", borderRadius: 18, background: `${C.emerald}08`, border: `1px solid ${C.emerald}25` }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.emerald, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.75rem" }}>✅ Humanized (After)</div>
            <p style={{ fontSize: "0.88rem", color: t.text, lineHeight: 1.75 }}>"AI's made its way into classrooms pretty fast — and honestly, the impact on how students learn has been pretty remarkable. But here's the thing: there are real ethical questions we probably should've been asking a lot sooner."</p>
          </div>
        </div>
      </div>

      {/* Testimonials */}
      <div style={{ maxWidth: 1100, margin: "0 auto 6rem", padding: "0 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.5rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>Loved by students worldwide</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "1.25rem" }}>
          {testimonials.map((t2, i) => (
            <div key={i} style={{ padding: "1.5rem", borderRadius: 20, background: t.card, border: `1px solid ${t.border}` }}>
              <div style={{ display: "flex", gap: "0.2rem", marginBottom: "0.85rem" }}>
                {[...Array(t2.rating)].map((_, j) => <span key={j} style={{ color: C.amber, fontSize: "0.9rem" }}>★</span>)}
              </div>
              <p style={{ fontSize: "0.88rem", color: t.text, lineHeight: 1.7, marginBottom: "1rem", fontStyle: "italic" }}>"{t2.text}"</p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "0.85rem" }}>{t2.name[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: t.text }}>{t2.name}</div>
                  <div style={{ fontSize: "0.75rem", color: t.muted }}>{t2.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div id="pricing" style={{ maxWidth: 1000, margin: "0 auto 6rem", padding: "0 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2 style={{ fontSize: "clamp(1.8rem,4vw,2.8rem)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: "0.75rem" }}>Simple, transparent pricing</h2>
          <p style={{ color: t.muted, fontSize: "1rem" }}>No hidden fees. Cancel anytime. Student discount available.</p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", padding: "0.4rem 1rem", borderRadius: 999, background: `${C.emerald}15`, border: `1px solid ${C.emerald}30`, color: C.emerald, fontSize: "0.8rem", fontWeight: 700 }}>
            🎓 Students get 15% OFF — verify with student email
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(265px,1fr))", gap: "1.25rem" }}>
          {plans.map(plan => (
            <div key={plan.name} style={{ padding: "2rem", borderRadius: 22, position: "relative", border: `2px solid ${plan.popular ? C.indigo : t.border}`, background: plan.popular ? (dark ? `linear-gradient(145deg,${C.indigo}12,${C.violet}08)` : `linear-gradient(145deg,${C.indigo}07,${C.violet}04)`) : t.card, boxShadow: plan.popular ? `0 12px 45px ${C.indigo}22` : "none" }}>
              {plan.popular && <div style={{ position: "absolute", top: -15, left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontSize: "0.7rem", fontWeight: 800, padding: "0.28rem 1.1rem", borderRadius: 999, whiteSpace: "nowrap", boxShadow: `0 4px 14px ${C.indigo}45` }}>⭐ MOST POPULAR</div>}
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: t.muted, marginBottom: "0.5rem" }}>{plan.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.2rem", marginBottom: "1.25rem" }}>
                <span style={{ fontSize: "3rem", fontWeight: 900, letterSpacing: "-0.035em", color: plan.popular ? C.indigo : t.text, lineHeight: 1 }}>{plan.price}</span>
                <span style={{ color: t.muted, fontSize: "0.9rem" }}>{plan.period}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginBottom: "1.75rem" }}>
                {plan.features.map(f => <div key={f} style={{ display: "flex", gap: "0.5rem" }}><span style={{ color: C.emerald, fontWeight: 800, flexShrink: 0 }}>✓</span><span style={{ fontSize: "0.87rem" }}>{f}</span></div>)}
              </div>
              {plan.stripe
                ? <a href={plan.stripe} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", padding: "0.78rem", borderRadius: 12, textDecoration: "none", fontWeight: 800, fontSize: "0.95rem", background: plan.popular ? `linear-gradient(135deg,${C.indigo},${C.violet})` : "transparent", border: plan.popular ? "none" : `1.5px solid ${t.border}`, color: plan.popular ? "#fff" : t.text, boxShadow: plan.popular ? `0 5px 22px ${C.indigo}38` : "none" }}>{plan.cta} →</a>
                : <button onClick={onStart} style={{ width: "100%", padding: "0.78rem", borderRadius: 12, border: `1.5px solid ${t.border}`, cursor: "pointer", background: "transparent", color: t.text, fontWeight: 800, fontSize: "0.95rem" }}>{plan.cta}</button>}
            </div>
          ))}
        </div>

        {/* Weekly option */}
        <div style={{ marginTop: "1.25rem", padding: "1.25rem 1.5rem", borderRadius: 16, background: t.card, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontWeight: 800, color: t.text }}>Weekly Plan — £7/week</div>
            <div style={{ fontSize: "0.85rem", color: t.muted }}>Perfect for short-term projects. All features included.</div>
          </div>
          <a href={STRIPE.weekly} target="_blank" rel="noreferrer" style={{ padding: "0.55rem 1.5rem", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: "0.88rem", background: `${C.indigo}15`, border: `1px solid ${C.indigo}30`, color: C.indigo }}>Get Weekly →</a>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${t.border}`, padding: "2rem 1.75rem", textAlign: "center", color: t.muted, fontSize: "0.82rem" }}>
        <div style={{ fontWeight: 900, fontSize: "1.2rem", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "0.5rem" }}>HumanWrite AI</div>
        © 2025 HumanWrite AI. All rights reserved.
        <span style={{ margin: "0 0.5rem" }}>·</span>
        <a href="#" style={{ color: t.muted, textDecoration: "none" }}>Privacy</a>
        <span style={{ margin: "0 0.5rem" }}>·</span>
        <a href="#" style={{ color: t.muted, textDecoration: "none" }}>Terms</a>
        <span style={{ margin: "0 0.5rem" }}>·</span>
        <a href="#" style={{ color: t.muted, textDecoration: "none" }}>Contact</a>
      </footer>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ user, apiKey, dark, setDark, onLogout }) {
  const t = th(dark);
  const [activeTool, setActiveTool] = useState("humanizer");
  const [showSupport, setShowSupport] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = [
    { id: "humanizer",  icon: "✍️", label: "AI Humanizer",  color: C.indigo },
    { id: "detector",   icon: "🔍", label: "AI Detector",   color: C.violet },
    { id: "paraphraser",icon: "🔁", label: "Paraphraser",   color: C.sky },
    { id: "grammar",    icon: "✅", label: "Grammar Check",  color: C.emerald },
    { id: "essay",      icon: "📄", label: "Essay Generator",color: C.amber },
    { id: "summarizer", icon: "📚", label: "Summarizer",    color: "#ec4899" },
  ];

  const activeItem = navItems.find(n => n.id === activeTool);
  const key = localStorage.getItem("hw_key") || apiKey;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: t.bg, fontFamily: "'Segoe UI',system-ui,sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: sidebarOpen ? 240 : 64, flexShrink: 0, background: t.sidebar, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", transition: "width 0.2s", overflow: "hidden" }}>
        {/* Logo */}
        <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: "0.65rem", minHeight: 64 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${C.indigo},${C.violet})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", flexShrink: 0 }}>✍️</div>
          {sidebarOpen && <span style={{ fontWeight: 900, fontSize: "1rem", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", whiteSpace: "nowrap" }}>HumanWrite AI</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0.75rem 0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTool(item.id)}
              style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.65rem 0.75rem", borderRadius: 10, border: "none", cursor: "pointer", background: activeTool === item.id ? `${item.color}15` : "transparent", color: activeTool === item.id ? item.color : t.muted, fontWeight: activeTool === item.id ? 700 : 500, fontSize: "0.87rem", textAlign: "left", transition: "all 0.15s", width: "100%" }}>
              <span style={{ fontSize: "1rem", flexShrink: 0 }}>{item.icon}</span>
              {sidebarOpen && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "0.75rem 0.5rem", borderTop: `1px solid ${t.border}` }}>
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.65rem 0.75rem", borderRadius: 10, border: "none", cursor: "pointer", background: "transparent", color: t.muted, fontSize: "0.85rem", width: "100%" }}>
            <span style={{ flexShrink: 0 }}>🚪</span>
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ height: 64, borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", background: t.sidebar, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ padding: "0.35rem 0.6rem", borderRadius: 8, border: "none", cursor: "pointer", background: t.card2, color: t.muted, fontSize: "1rem" }}>☰</button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1rem" }}>{activeItem?.icon}</span>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: t.text }}>{activeItem?.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <button onClick={() => setShowSupport(!showSupport)} style={{ padding: "0.38rem 0.9rem", borderRadius: 8, border: `1px solid ${t.border}`, cursor: "pointer", background: showSupport ? `${C.indigo}15` : "transparent", color: showSupport ? C.indigo : t.muted, fontWeight: 600, fontSize: "0.82rem" }}>💬 Support</button>
            <button onClick={() => setDark(!dark)} style={{ padding: "0.38rem 0.65rem", borderRadius: 8, border: "none", cursor: "pointer", background: t.card2, fontSize: "0.95rem" }}>{dark ? "☀️" : "🌙"}</button>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.28rem 0.78rem", borderRadius: 8, background: t.card2, border: `1px solid ${t.border}` }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "0.7rem" }}>{user?.name?.[0]}</div>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: t.muted }}>{user?.name?.split(" ")[0]}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "1.75rem", overflowY: "auto" }}>
          {activeTool === "humanizer"   && <Humanizer   apiKey={key} dark={dark} />}
          {activeTool === "detector"    && <Detector    apiKey={key} dark={dark} />}
          {activeTool === "paraphraser" && <Paraphraser apiKey={key} dark={dark} />}
          {activeTool === "grammar"     && <Grammar     apiKey={key} dark={dark} />}
          {activeTool === "essay"       && <EssayGenerator apiKey={key} dark={dark} />}
          {activeTool === "summarizer"  && <Summarizer  apiKey={key} dark={dark} />}
        </div>
      </div>

      {/* Support */}
      {showSupport && <SupportChat apiKey={key} dark={dark} currentTool={activeItem?.label} onClose={() => setShowSupport(false)} />}
      {!showSupport && (
        <button onClick={() => setShowSupport(true)} style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", width: 54, height: 54, borderRadius: "50%", border: "none", cursor: "pointer", background: `linear-gradient(135deg,${C.indigo},${C.violet})`, color: "#fff", fontSize: "1.3rem", boxShadow: `0 6px 24px ${C.indigo}50`, zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center" }}>💬</button>
      )}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(true);
  const [page, setPage] = useState("landing");
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("hw_user") || "null"); } catch { return null; } });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("hw_key") || "");

  function handleLogin(u) { localStorage.setItem("hw_user", JSON.stringify(u)); setUser(u); setPage("platform"); }
  function handleLogout() { localStorage.removeItem("hw_user"); localStorage.removeItem("hw_key"); setUser(null); setApiKey(""); setPage("landing"); }
  function handleSaveKey(k) { setApiKey(k); setPage("platform"); }
  function handleStart() { if (user && apiKey) { setPage("platform"); } else if (user) { setPage("key"); } else { setPage("auth"); } }

  if (page === "landing") return <Landing onStart={handleStart} dark={dark} setDark={setDark} />;
  if (page === "auth")    return <AuthScreen onLogin={handleLogin} dark={dark} />;
  if (page === "key")     return <KeyScreen user={user} onSave={handleSaveKey} onLogout={handleLogout} dark={dark} />;
  if (page === "platform" && user && apiKey) return <Dashboard user={user} apiKey={apiKey} dark={dark} setDark={setDark} onLogout={handleLogout} />;

  return <Landing onStart={handleStart} dark={dark} setDark={setDark} />;
}
