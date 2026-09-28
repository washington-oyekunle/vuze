import { useState } from "react";
import { ArrowDownRight, ArrowRight, Check, Menu, ShieldCheck, Sparkles, X } from "lucide-react";
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
  return <footer className="footer"><div className="page-wrap footer-inner"><span>© 2026 VUZE. Real views, real value.</span><div className="footer-links"><Link href="/learn">Creator resources</Link><a href="mailto:hello@vuze.example">Contact</a><a href="/campaigns">Campaign terms</a><span>Prototype preview</span></div></div></footer>;
}

function HeroChart() {
  return <div className="hero-art" aria-label="Illustrative creator earnings preview"><div className="hero-orbit" />
    <div className="metric-card"><div className="metric-head"><span>Creator earnings</span><span>Last 30 days⌄</span></div><div className="metric-value">$1,284 <span className="metric-change">↗ 18.6%</span></div>
      <svg className="chart-svg" viewBox="0 0 320 100" role="img" aria-label="Illustrative upward earnings chart"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c8102e" stopOpacity=".17"/><stop offset="1" stopColor="#c8102e" stopOpacity="0"/></linearGradient></defs><path d="M0 80 C25 69, 32 74, 51 65 S85 72, 107 51 S145 62, 165 43 S198 52, 217 30 S251 46, 270 21 S298 26, 320 8 L320 100 L0 100Z" fill="url(#chartFill)"/><path d="M0 80 C25 69, 32 74, 51 65 S85 72, 107 51 S145 62, 165 43 S198 52, 217 30 S251 46, 270 21 S298 26, 320 8" fill="none" stroke="#c8102e" strokeWidth="2.3" strokeLinecap="round"/><circle cx="320" cy="8" r="4" fill="#c8102e" stroke="white" strokeWidth="2"/></svg>
      <div className="metric-foot"><span>Sample dashboard data</span><span>Demo only</span></div>
    </div><div className="floating-pill pill-one"><span className="pill-icon"><ShieldCheck size={15} /></span><span>Human-reviewed<br /><small style={{ color: "#898981", fontWeight: 500 }}>trust comes first</small></span></div><div className="floating-pill pill-two"><span style={{ color: "#c8102e" }}><Sparkles size={15} /></span><span>Clear rates. No guesswork.</span></div>
  </div>;
}

function CampaignCard({ item }: { item: (typeof campaigns)[number] }) {
  return <article className="campaign-card"><div className="campaign-top"><span className="project-mark" style={{ background: item.accent }}>{item.name.slice(0, 1)}</span><span className="tag">{item.category}</span></div><h3 className="campaign-title">{item.name}</h3><div className="campaign-ticker">{item.ticker} · Illustrative campaign</div><p className="campaign-desc">{item.description}</p><div className="campaign-meta"><div><div className="meta-label">Rate per 1,000 views</div><div className="meta-value">${item.rate.toFixed(2)} <small>/ 1K</small></div></div><div><div className="meta-label">Maximum per video</div><div className="meta-value">${item.maxPayout}</div></div><div><div className="meta-label">Minimum views</div><div className="meta-value">{item.minViews.toLocaleString()}</div></div><div><div className="meta-label">Closes</div><div className="meta-value">{item.deadline}</div></div></div><div className="platform-list">{item.platforms.slice(0, 3).map((platform) => <span className="platform-chip" key={platform}>{platform}</span>)}</div><Link className="card-link" href={`/campaigns/${item.id}`}>View campaign <ArrowRight size={14} /></Link></article>;
}

export default function Home() {
  return <><PublicNav /><div className="demo-note"><strong>Preview build · Sample campaign and earnings data</strong> — platform tracking, verification, and payouts are not connected in this prototype.</div><main>
    <div className="page-wrap"><section className="hero"><div><div className="eyebrow"><span className="eyebrow-dot" /> The creator economy, with receipts</div><h1>Real views.<br /><em>Real value.</em></h1><p className="hero-copy">Make short-form content for the coins you believe in. Get rewarded for the views you earn — with clear rates and trust built in.</p><div className="hero-buttons"><Link href="/campaigns" className="btn btn-red">Find your next campaign <ArrowRight size={15} /></Link><Link href="/dashboard" className="btn btn-light">Open creator workspace</Link></div><div className="hero-caption"><div className="avatar-stack"><span>A</span><span>M</span><span>J</span><span>+</span></div><span>Built for creators, not vanity metrics</span><ArrowDownRight size={13} /></div></div><HeroChart /></section></div>
    <div className="stat-band"><div className="page-wrap"><div className="stat-row">{[["$184K", "Illustrative creator rewards"], ["24", "Sample active campaigns"], ["72 hr", "Target review window"], ["1:1", "Human review on flags"]].map(([value, label]) => <div className="stat-item" key={label}><div><div className="stat-number">{value}</div><div className="stat-label">{label}</div></div></div>)}</div></div></div>
    <section className="section"><div className="page-wrap"><div className="section-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> Open opportunities</div><h2 className="section-title">Pick a campaign.<br />Make it your own.</h2><p className="section-sub">A small preview of the kinds of campaigns creators can explore. Every rate and budget below is illustrative sample data.</p></div><Link href="/campaigns" className="btn btn-light">Browse all campaigns <ArrowRight size={14} /></Link></div><div className="campaign-grid">{campaigns.filter((item) => item.featured).slice(0, 3).map((item) => <CampaignCard key={item.id} item={item} />)}</div></div></section>
    <section className="section" id="how" style={{ background: "#f0f0ed" }}><div className="page-wrap"><div className="section-header"><div><div className="eyebrow"><span className="eyebrow-dot" /> Straightforward by design</div><h2 className="section-title">From idea to payout,<br />without the guesswork.</h2></div></div><div className="how-grid">{[["01", "Choose a brief", "Find a campaign that fits your format, audience, and point of view."], ["02", "Make it yours", "Create an original short-form post that follows the campaign rules."], ["03", "Submit your link", "Share the public post URL and follow its review status in one place."], ["04", "Earn for real views", "Eligible views are reviewed against the campaign terms before payout."]].map(([step, title, copy]) => <div className="how-item" key={step}><div className="step-number">{step}</div><h3>{title}</h3><p>{copy}</p></div>)}</div><p style={{ color: "#85857e", fontSize: 10, marginTop: 12 }}>Illustrative flow only. Actual social-account verification, view tracking, approval, and payout services are not yet connected.</p></div></section>
    <section className="section"><div className="page-wrap"><div className="cta-panel"><div><h2>Your next idea can<br />go further.</h2><p>Explore creator briefs and see how VUZE is designed to work.</p></div><Link href="/campaigns" className="btn btn-red">Explore campaigns <ArrowRight size={15} /></Link></div></div></section>
    <section style={{ padding: "0 0 55px" }}><div className="page-wrap" style={{ color: "#8b8b84", fontSize: 10, display: "flex", gap: 8, alignItems: "center" }}><Check size={14} color="#267255" />A trust-first system is part of the product: ownership checks, anomaly signals, rate limits, and clear human review.</div></section>
  </main><Footer /></>;
}
