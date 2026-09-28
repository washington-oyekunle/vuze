import { useState } from "react";
import { ArrowRight, Check, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
import { Link } from "wouter";
import { campaigns } from "@/lib/vuze-data";

const LOGO = "/manus-storage/vuze-logo_0bd65c44.png";

function Brand() {
  return <Link href="/" className="brand"><img src={LOGO} alt="" /><span>vuze</span></Link>;
}

function PublicNav({ active = "" }: { active?: string }) {
  const [open, setOpen] = useState(false);
  return <header className="topbar"><div className="topbar-inner"><Brand />
    <nav className="nav-links"><Link className={active === "campaigns" ? "active" : ""} href="/campaigns">Campaigns</Link><Link className={active === "learn" ? "active" : ""} href="/learn">Creator resources</Link><a href="/#how">How it works</a></nav>
    <div className="nav-actions"><Link className="nav-login" href="/dashboard">Creator workspace</Link><Link className="btn btn-dark btn-sm" href="/campaigns">Explore campaigns <ArrowRight size={14} /></Link><button className="icon-btn mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X size={16} /> : <Menu size={16} />}</button></div>
    {open && <nav className="mobile-nav"><Link href="/campaigns" onClick={() => setOpen(false)}>Campaigns</Link><Link href="/learn" onClick={() => setOpen(false)}>Creator resources</Link><a href="/#how" onClick={() => setOpen(false)}>How it works</a><Link href="/dashboard" onClick={() => setOpen(false)}>Creator workspace</Link></nav>}
  </div></header>;
}

function Footer() {
  return <footer className="footer"><div className="page-wrap footer-inner"><span>© 2026 VUZE. Real views, real value.</span><div className="footer-links"><Link href="/learn">Creator resources</Link><a href="mailto:hello@vuze.example">Contact</a><a href="/campaigns">Campaign terms</a><span>Early access</span></div></div></footer>;
}

function TrustVisual() {
  return <div className="hero-art" aria-label="VUZE creator-trust principles"><div className="hero-orbit" />
    <div className="metric-card trust-principles-card"><div className="metric-head"><span>Creator trust</span><span>By design</span></div><div className="trust-principle"><span>01</span><div><strong>Clear campaign terms</strong><small>Understand the brief before you post.</small></div></div><div className="trust-principle"><span>02</span><div><strong>Privacy-aware signals</strong><small>Use proportionate, authorized checks.</small></div></div><div className="trust-principle"><span>03</span><div><strong>Human review</strong><small>Give creators reasons and recourse.</small></div></div><div className="metric-foot"><span>Product principles</span><span>Not connected yet</span></div></div>
    <div className="floating-pill pill-one"><span className="pill-icon"><ShieldCheck size={15} /></span><span>Trust comes first<br /><small style={{ color: "#898981", fontWeight: 500 }}>clear by design</small></span></div><div className="floating-pill pill-two"><span style={{ color: "#c8102e" }}><Sparkles size={15} /></span><span>Clear rates. No guesswork.</span></div>
  </div>;
}

function CampaignCard({ item }: { item: (typeof campaigns)[number] }) {
  return <article className="campaign-card"><div className="campaign-top"><span className="project-mark" style={{ background: item.accent }}>{item.name.slice(0, 1)}</span><span className="tag">{item.category}</span></div><h3 className="campaign-title">{item.name}</h3><div className="campaign-ticker">{item.ticker}</div><p className="campaign-desc">{item.description}</p><div className="campaign-meta"><div><div className="meta-label">Rate per 1,000 views</div><div className="meta-value">${item.rate.toFixed(2)} <small>/ 1K</small></div></div><div><div className="meta-label">Maximum per video</div><div className="meta-value">${item.maxPayout}</div></div><div><div className="meta-label">Minimum views</div><div className="meta-value">{item.minViews.toLocaleString()}</div></div><div><div className="meta-label">Closes</div><div className="meta-value">{item.deadline}</div></div></div><div className="platform-list">{item.platforms.slice(0, 3).map((platform) => <span className="platform-chip" key={platform}>{platform}</span>)}</div><Link className="card-link" href={`/campaigns/${item.id}`}>View campaign <ArrowRight size={14} /></Link></article>;
}

export default function Home() {
  return <><PublicNav /><div className="demo-note"><strong>Early access</strong> — campaign listings and social, verification, view-tracking, and payout integrations will appear when available.</div><main>
    <div className="page-wrap"><section className="hero"><div><div className="eyebrow"><span className="eyebrow-dot" /> The creator economy, with receipts</div><h1>Real views.<br /><em>Real value.</em></h1><p className="hero-copy">Make short-form content for the coins you believe in. Get rewarded for the views you earn — with clear rates and trust built in.</p><div className="hero-buttons"><Link href="/campaigns" className="btn btn-red">Explore campaigns <ArrowRight size={15} /></Link><Link href="/dashboard" className="btn btn-light">Open creator workspace</Link></div><div className="hero-caption"><span>Built for creators, not vanity metrics</span><ArrowRight size={13} /></div></div><TrustVisual /></section></div>
    <div className="stat-band"><div className="page-wrap"><div className="stat-row">{[["Clear terms", "Know what each brief asks for"], ["Creator-owned", "Keep your voice and point of view"], ["Human review", "Reasons should be clear"], ["Trust-first", "Privacy-aware by design"]].map(([value, label]) => <div className="stat-item" key={value}><div><div className="stat-number stat-phrase">{value}</div><div className="stat-label">{label}</div></div></div>)}</div></div></div>
    <section className="section"><div className="page-wrap"><div className="section-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> Open opportunities</div><h2 className="section-title">Pick a campaign.<br />Make it your own.</h2><p className="section-sub">Live campaign briefs will be published here when they’re available.</p></div><Link href="/campaigns" className="btn btn-light">Browse all campaigns <ArrowRight size={14} /></Link></div>{campaigns.length > 0 ? <div className="campaign-grid">{campaigns.filter((item) => item.featured).slice(0, 3).map((item) => <CampaignCard key={item.id} item={item} />)}</div> : <div className="empty-state public-empty-state"><strong>No campaigns are live yet.</strong><br />New creator opportunities will appear here when the marketplace opens.</div>}</div></section>
    <section className="section" id="how" style={{ background: "#f0f0ed" }}><div className="page-wrap"><div className="section-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> Straightforward by design</div><h2 className="section-title">Clear expectations,<br />at every step.</h2></div></div><div className="how-grid">{[["01", "Choose a brief", "Find a campaign that fits your format, audience, and point of view."], ["02", "Make it yours", "Create original work that follows the published campaign rules."], ["03", "Submit your link", "Share the public post URL when the submission flow is available."], ["04", "Review and payment", "Eligible views and payout terms will follow each live campaign’s rules."]].map(([step, title, copy]) => <div className="how-item" key={step}><div className="step-number">{step}</div><h3>{title}</h3><p>{copy}</p></div>)}</div><p style={{ color: "#85857e", fontSize: 10, marginTop: 12 }}>Account verification, view tracking, moderation actions, and payments are not connected yet.</p></div></section>
    <section className="section"><div className="page-wrap"><div className="cta-panel"><div><h2>Your next idea can<br />go further.</h2><p>Explore VUZE and see how its creator marketplace is designed to work.</p></div><Link href="/campaigns" className="btn btn-red">Explore campaigns <ArrowRight size={15} /></Link></div></div></section>
    <section style={{ padding: "0 0 55px" }}><div className="page-wrap" style={{ color: "#8b8b84", fontSize: 10, display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color="#267255" />A trust-first system is part of the product design: ownership checks, anomaly signals, rate limits, and clear human review.</div></section>
  </main><Footer /></>;
}
