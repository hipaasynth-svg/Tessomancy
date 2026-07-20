"use client";
import { useState, useEffect, useCallback } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState("idle"); // idle | asking | done
  const [result, setResult] = useState(null);
  const [billing, setBilling] = useState(null); // null while loading
  const [purchaseNotice, setPurchaseNotice] = useState(null);
  const [checkoutBusy, setCheckoutBusy] = useState(null); // tier key currently launching, or null

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      // A failed status check must never be mistaken for "no access" — that
      // renders a pricing screen with no tier data and goes silently blank.
      // Leave billing as null (falls back to showing the ask box) so the
      // per-request check in /api/verdict stays the real gate either way.
      if (!res.ok || data.status === "error" || typeof data.hasAccess !== "boolean") {
        return null;
      }
      setBilling(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get("purchase");
    if (purchase) {
      window.history.replaceState({}, "", "/");
    }
    if (purchase === "success") {
      setPurchaseNotice("settling your purchase…");
      pollAfterPurchase();
    } else {
      fetchStatus();
    }

    async function pollAfterPurchase() {
      for (let i = 0; i < 6; i++) {
        const data = await fetchStatus();
        if (data && (data.packBalance > 0 || data.subscription?.active)) {
          setPurchaseNotice(null);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setPurchaseNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask() {
    if (question.trim().length < 3 || state === "asking") return;
    setState("asking");
    setResult(null);
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ status: "error", message: "The oracle could not be reached." });
    }
    setState("done");
    fetchStatus();
  }

  async function startCheckout(tierKey) {
    setCheckoutBusy(tierKey);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier: tierKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through to reset busy state below
    }
    setCheckoutBusy(null);
  }

  async function redeemCode(code) {
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (data.status === "ok") {
      setBilling(data.billing);
    }
    return data;
  }

  async function openPortal() {
    try {
      const res = await fetch("/api/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // no-op — the manage link just does nothing if the portal can't open
    }
  }

  function reset() {
    setState("idle");
    setResult(null);
    setQuestion("");
  }

  const restingUntilRenewal = billing?.subscription?.hardCapped === true;
  const showPricing = billing && !billing.hasAccess && !restingUntilRenewal;

  return (
    <main className="wrap">
      <Styles />
      <header className="masthead">
        <div className="mark">✶</div>
        <h1>TESSOMANCY</h1>
        <p className="tag">the odds, honestly</p>
      </header>

      {purchaseNotice && <p className="purchasenotice">{purchaseNotice}</p>}

      {state !== "done" && restingUntilRenewal && (
        <section className="card silent">
          <div className="silentmark">—</div>
          <p className="silenttext">She rests until the turning of the month.</p>
        </section>
      )}

      {state !== "done" && !restingUntilRenewal && showPricing && (
        <Pricing
          tiers={billing.tiers}
          busy={checkoutBusy}
          onSelect={startCheckout}
          freeTasteResetsInDays={billing.freeTasteResetsInDays}
          onRedeem={redeemCode}
        />
      )}

      {state !== "done" && !restingUntilRenewal && !showPricing && (
        <section className="asker">
          <p className="prompt">
            Only facts, never novelty. Ask a high-stakes question about any part of
            life — love, work, health, money — and the oracle reads the <em>real
            odds</em> for situations like yours, drawn from live data. Not advice.
            Never about you specifically — only the field you stand in.
          </p>
          <p className="tease">
            There's a real answer to this — most people guess wrong. You're here
            because you want it straight.
          </p>
          <textarea
            className="field"
            rows={3}
            placeholder="e.g. We married at 24, no prior marriages — will it last? · Do startups in my industry survive five years? · What are the odds this surgery goes without complications?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={state === "asking"}
          />
          <button className="cast" onClick={ask} disabled={state === "asking" || question.trim().length < 3}>
            {state === "asking" ? "reading the leaves…" : "enlighten me"}
          </button>
          <BillingLine billing={billing} onManage={openPortal} />
          <p className="fineprint">
            No account. No name. Questions are remembered; people are not.
          </p>
          <PromoRedeem onRedeem={redeemCode} />
        </section>
      )}

      {state === "done" && result && (
        <Verdict
          result={result}
          onAgain={reset}
          tiers={billing?.tiers}
          checkoutBusy={checkoutBusy}
          onSelectTier={startCheckout}
          onRedeem={redeemCode}
        />
      )}

      <footer className="foot">
        <svg className="moon" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <mask id="moonMask">
            <rect width="22" height="22" fill="white" />
            <circle cx="14" cy="8" r="7.5" fill="black" />
          </mask>
          <circle cx="11" cy="11" r="7.5" fill="var(--gold)" mask="url(#moonMask)" />
        </svg>
        <p className="footline">A probabilistic reading, not advice. Not a wager.</p>
      </footer>
    </main>
  );
}

function BillingLine({ billing, onManage }) {
  if (!billing) return null;
  if (billing.unlimited) {
    return <p className="balanceline">unlimited access</p>;
  }
  const sub = billing.subscription;
  if (sub?.active) {
    return (
      <p className="balanceline">
        subscribed — unlimited within fair use
        <button className="managelink" onClick={onManage}>manage</button>
      </p>
    );
  }
  if (billing.packBalance > 0) {
    return (
      <p className="balanceline">
        {billing.packBalance} verdict{billing.packBalance === 1 ? "" : "s"} remaining
      </p>
    );
  }
  if (billing.freeTasteAvailable) {
    return <p className="balanceline">one free reading this week</p>;
  }
  return null;
}

function Pricing({ tiers, busy, onSelect, freeTasteResetsInDays, onRedeem }) {
  if (!tiers) return null;
  return (
    <section className="pricing">
      <p className="prompt">
        Your free weekly reading is spent. Choose how you'd like to keep asking.
      </p>
      {freeTasteResetsInDays && (
        <p className="scarcity">
          Your next free reading unlocks in {freeTasteResetsInDays} day{freeTasteResetsInDays === 1 ? "" : "s"}
          {" "}— or skip the wait:
        </p>
      )}
      <div className="tiers">
        {tiers.map((t) => (
          <div className="tier" key={t.key}>
            <div className="tiername">{t.name}</div>
            <div className="tierprice">
              ${(t.amount / 100).toFixed(2)}
              {t.mode === "subscription" ? <span className="tierper">/mo</span> : null}
            </div>
            <div className="tierdesc">
              {t.mode === "subscription" ? "unlimited within fair use" : `${t.verdicts} verdicts`}
            </div>
            <button className="tierbtn" disabled={busy === t.key} onClick={() => onSelect(t.key)}>
              {busy === t.key ? "opening…" : "choose"}
            </button>
          </div>
        ))}
      </div>
      <PromoRedeem onRedeem={onRedeem} />
    </section>
  );
}

function PromoRedeem({ onRedeem }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok: boolean, text: string }

  if (!onRedeem) return null;

  async function submit(e) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    const data = await onRedeem(code.trim());
    if (data.status === "ok") {
      setMsg({ ok: true, text: "Code redeemed." });
      setCode("");
    } else {
      setMsg({ ok: false, text: data.message || "That code didn't work." });
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" className="promolink" onClick={() => setOpen(true)}>
        have a code?
      </button>
    );
  }

  return (
    <form className="promoform" onSubmit={submit}>
      <div className="promorow">
        <input
          className="promoinput"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="promo code"
          autoFocus
          disabled={busy}
        />
        <button className="promobtn" type="submit" disabled={busy || !code.trim()}>
          {busy ? "…" : "redeem"}
        </button>
      </div>
      {msg && <p className={msg.ok ? "promomsg promomsg-ok" : "promomsg promomsg-error"}>{msg.text}</p>}
    </form>
  );
}

function MirrorBlock({ mirror }) {
  const [shareState, setShareState] = useState("idle"); // idle | copied

  async function share() {
    const text = `"${mirror}"\n\n— Tessomancy, the odds, honestly`;
    const url = "https://tessomancy.com";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text, url });
      } catch {
        // user cancelled — not an error
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do
    }
  }

  return (
    <div className="mirror">
      <span className="mlabel">the mirror</span>
      <p>{mirror}</p>
      <button className="sharebtn" onClick={share}>
        {shareState === "copied" ? "copied" : "share this"}
      </button>
    </div>
  );
}

function Verdict({ result, onAgain, tiers, checkoutBusy, onSelectTier, onRedeem }) {
  if (result.status === "spoken") {
    return (
      <section className="card spoken">
        {result.softCapNotice && <p className="softcap">{result.softCapNotice}</p>}
        <div className="conf" data-c={result.confidence}>{confLabel(result.confidence)}</div>
        <h2 className="headline">{result.headline}</h2>
        <ul className="odds">
          {result.outcomes.map((o, i) => (
            <li key={i}>
              <div className="bar-row">
                <span className="olabel">{o.label}</span>
                <span className="opct">{o.probability}%</span>
              </div>
              <div className="track"><div className="fill" style={{ width: `${o.probability}%` }} /></div>
            </li>
          ))}
        </ul>
        {result.basis && <p className="basis">{result.basis}</p>}
        <MirrorBlock mirror={result.mirror} />
        <p className="disclaimer">{result.disclaimer}</p>
        <button className="again" onClick={onAgain}>ask another</button>
      </section>
    );
  }
  if (result.status === "silent") {
    return (
      <section className="card silent">
        <div className="silentmark">—</div>
        <p className="silenttext">{result.reason}</p>
        {result.hint && <p className="silenthint">{result.hint}</p>}
        <button className="again" onClick={onAgain}>rephrase and ask again</button>
      </section>
    );
  }
  if (result.status === "wall") {
    return (
      <section className="card wall">
        <p className="walltext">{result.message}</p>
        <button className="again" onClick={onAgain}>ask another</button>
      </section>
    );
  }
  if (result.status === "rested") {
    return (
      <section className="card silent">
        <div className="silentmark">—</div>
        <p className="silenttext">{result.message}</p>
        <button className="again" onClick={onAgain}>close</button>
      </section>
    );
  }
  if (result.status === "paywall") {
    return (
      <section className="card wall">
        <p className="walltext">Your free weekly reading is spent.</p>
        <Pricing
          tiers={result.tiers || tiers}
          busy={checkoutBusy}
          onSelect={onSelectTier}
          freeTasteResetsInDays={result.freeTasteResetsInDays}
          onRedeem={onRedeem}
        />
        <button className="again" onClick={onAgain}>back</button>
      </section>
    );
  }
  return (
    <section className="card silent">
      <p className="silenttext">{result.message || "The oracle went quiet."}</p>
      <button className="again" onClick={onAgain}>try again</button>
    </section>
  );
}

function confLabel(c) {
  if (c === "firm") return "firm reading";
  if (c === "thin") return "thin reading — hold loosely";
  return "moderate reading";
}

function Styles() {
  return (
    <style>{`
      :root{
        --ink:#141821; --ink2:#2a3040; --porcelain:#f3efe7; --porcelain2:#e8e2d5;
        --leaf:#3f5c4a; --leaf-soft:#6d8a76; --tea:#7a5a3a; --gold:#b08a4f;
        --line:#c9c0ad;
      }
      *{box-sizing:border-box}
      html,body{margin:0;padding:0}
      body{
        background:
          radial-gradient(120% 80% at 50% -10%, #1b212e 0%, #141821 55%, #0e1119 100%);
        color:var(--porcelain);
        font-family:'Newsreader',Georgia,serif;
        -webkit-font-smoothing:antialiased;
        min-height:100dvh;
      }
      .wrap{
        max-width:520px;margin:0 auto;padding:32px 22px 40px;
        min-height:100dvh;display:flex;flex-direction:column;
      }
      .masthead{text-align:center;margin:14px 0 26px}
      .mark{color:#ffe135;font-size:20px;letter-spacing:2px;opacity:1;text-shadow:0 0 14px rgba(255,225,53,.75)}
      .masthead h1{
        font-family:'Fraunces',serif;font-weight:600;
        font-size:30px;letter-spacing:.14em;margin:6px 0 2px;
        color:var(--porcelain);
      }
      .tag{font-style:italic;color:var(--leaf-soft);margin:0;font-size:15px;letter-spacing:.02em}

      .purchasenotice{
        text-align:center;color:var(--gold);font-style:italic;font-size:14px;
        margin:0 0 16px;letter-spacing:.02em;
      }

      .asker{margin-top:8px}
      .prompt{color:#cfc8b8;font-size:16px;line-height:1.55;margin:0 0 18px}
      .prompt em{color:var(--gold);font-style:italic}
      .tease{color:var(--gold);font-style:italic;font-size:15px;line-height:1.5;margin:0 0 16px}

      .scarcity{color:#9a927e;font-size:13.5px;font-style:italic;margin:0 0 14px;line-height:1.5}
      .field{
        width:100%;background:rgba(243,239,231,.04);
        border:1px solid var(--ink2);border-radius:14px;
        color:var(--porcelain);font-family:'Newsreader',serif;font-size:17px;
        padding:15px 16px;line-height:1.5;resize:none;outline:none;
      }
      .field:focus{border-color:var(--leaf-soft);background:rgba(243,239,231,.06)}
      .field::placeholder{color:#aab2c8}
      .cast{
        width:100%;margin-top:14px;padding:16px;border:none;border-radius:14px;
        background:linear-gradient(180deg,var(--leaf) 0%,#33493c 100%);
        color:var(--porcelain);font-family:'Fraunces',serif;font-weight:600;
        font-size:17px;letter-spacing:.14em;text-transform:lowercase;cursor:pointer;
        transition:transform .12s ease, opacity .2s ease;
      }
      .cast:disabled{opacity:.5;cursor:default}
      .cast:not(:disabled):active{transform:translateY(1px)}
      .fineprint{text-align:center;color:#7c8394;font-size:13px;margin-top:14px;letter-spacing:.01em}

      .promolink{
        display:block;margin:14px auto 0;background:none;border:none;
        color:#7c8394;font-family:'Newsreader',serif;font-style:italic;
        font-size:13px;text-decoration:underline;cursor:pointer;padding:0;
      }
      .promoform{margin-top:14px}
      .promorow{display:flex;gap:8px}
      .promoinput{
        flex:1 1 auto;background:rgba(243,239,231,.04);
        border:1px solid var(--ink2);border-radius:10px;
        color:var(--porcelain);font-family:'Newsreader',serif;font-size:14px;
        padding:10px 12px;outline:none;min-width:0;
      }
      .promoinput:focus{border-color:var(--leaf-soft)}
      .promoinput::placeholder{color:#7c8394}
      .promobtn{
        flex:0 0 auto;padding:10px 16px;border:1px solid var(--leaf-soft);border-radius:10px;
        background:transparent;color:var(--leaf-soft);font-family:'Fraunces',serif;
        font-size:13px;letter-spacing:.04em;cursor:pointer;
      }
      .promobtn:disabled{opacity:.5;cursor:default}
      .promomsg{font-size:12.5px;margin:8px 0 0;font-style:italic}
      .promomsg-ok{color:var(--leaf-soft)}
      .promomsg-error{color:#c98a6a}

      .balanceline{
        text-align:center;color:#9a927e;font-size:13px;margin:14px 0 0;
        letter-spacing:.02em;display:flex;align-items:center;justify-content:center;gap:10px;
      }
      .managelink{
        background:none;border:none;color:var(--gold);font-family:'Newsreader',serif;
        font-style:italic;font-size:13px;cursor:pointer;padding:0;text-decoration:underline;
      }

      .pricing{margin-top:8px}
      .tiers{display:flex;flex-direction:column;gap:12px}
      .tier{
        background:rgba(243,239,231,.04);border:1px solid var(--ink2);border-radius:14px;
        padding:16px 18px;display:flex;align-items:center;flex-wrap:wrap;gap:4px 14px;
      }
      .tiername{font-family:'Fraunces',serif;font-weight:600;font-size:16px;color:var(--porcelain);flex:1 1 auto}
      .tierprice{font-family:'Fraunces',serif;font-weight:600;font-size:18px;color:var(--gold)}
      .tierper{font-size:12px;color:#9a927e;font-weight:400}
      .tierdesc{flex-basis:100%;color:#9a927e;font-size:13.5px;margin-top:-2px}
      .tierbtn{
        margin-left:auto;padding:9px 18px;border:1px solid var(--leaf-soft);border-radius:10px;
        background:transparent;color:var(--leaf-soft);font-family:'Fraunces',serif;
        font-size:13.5px;letter-spacing:.06em;cursor:pointer;
      }
      .tierbtn:disabled{opacity:.5;cursor:default}
      .tierbtn:not(:disabled):active{transform:translateY(1px)}

      .card{
        margin-top:6px;background:linear-gradient(180deg,#f6f2ea 0%,#efe9dd 100%);
        color:var(--ink);border-radius:18px;padding:24px 22px 20px;
        box-shadow:0 20px 60px rgba(0,0,0,.45), 0 2px 0 rgba(255,255,255,.4) inset;
        animation:rise .5s cubic-bezier(.2,.7,.2,1) both;
      }
      @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
      .softcap{
        font-style:italic;color:var(--tea);font-size:14px;line-height:1.5;
        margin:0 0 16px;padding-bottom:14px;border-bottom:1px solid var(--line);
      }
      .conf{
        display:inline-block;font-family:'Fraunces',serif;font-size:12px;
        letter-spacing:.14em;text-transform:uppercase;color:var(--tea);
        border:1px solid var(--line);border-radius:999px;padding:5px 11px;margin-bottom:14px;
      }
      .conf[data-c="thin"]{color:#9a6a3a;border-color:#d8c19a}
      .headline{
        font-family:'Fraunces',serif;font-weight:600;font-size:25px;line-height:1.25;
        margin:0 0 18px;color:var(--ink);
      }
      .odds{list-style:none;margin:0 0 4px;padding:0}
      .odds li{margin-bottom:14px}
      .bar-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:5px}
      .olabel{font-size:15.5px;line-height:1.35;color:var(--ink2)}
      .opct{font-family:'Fraunces',serif;font-weight:600;font-size:17px;color:var(--leaf)}
      .track{height:7px;background:#ded6c6;border-radius:99px;overflow:hidden}
      .fill{height:100%;background:linear-gradient(90deg,var(--leaf-soft),var(--leaf));border-radius:99px;
        animation:grow .8s cubic-bezier(.2,.7,.2,1) both}
      @keyframes grow{from{width:0 !important}}
      .basis{font-style:italic;color:#5a5346;font-size:14.5px;margin:10px 0 0;line-height:1.5}

      .mirror{margin:20px 0 6px;padding:16px 16px 14px;background:rgba(63,92,74,.08);
        border-left:3px solid var(--leaf);border-radius:6px}
      .mlabel{font-family:'Fraunces',serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--tea)}
      .mirror p{margin:6px 0 0;font-size:16px;line-height:1.5;color:var(--ink);font-style:italic}
      .sharebtn{
        margin-top:10px;padding:6px 0;border:none;background:none;
        color:var(--tea);font-family:'Fraunces',serif;font-size:12px;
        letter-spacing:.1em;text-transform:uppercase;cursor:pointer;text-decoration:underline;
      }

      .disclaimer{font-size:12.5px;color:#8a8272;line-height:1.5;margin:16px 0 0}
      .again{
        width:100%;margin-top:18px;padding:13px;border:1px solid var(--line);
        background:transparent;border-radius:12px;color:var(--ink2);
        font-family:'Fraunces',serif;font-size:15px;letter-spacing:.08em;cursor:pointer;
      }
      .again:active{background:rgba(0,0,0,.04)}

      .card.silent, .card.wall{
        background:linear-gradient(180deg,#1c2230 0%,#161b26 100%);
        color:#cfc8b8;box-shadow:0 20px 50px rgba(0,0,0,.4);
      }
      .silentmark{font-size:34px;color:var(--leaf-soft);text-align:center;line-height:1}
      .silenttext{font-size:18px;line-height:1.55;text-align:center;color:#d4cdbd;margin:14px 4px 4px;font-style:italic}
      .silenthint{font-size:14px;line-height:1.55;text-align:center;color:#9a927e;margin:14px 8px 0}
      .walltext{font-size:17px;line-height:1.6;color:#e3dccb;margin:2px 2px 4px}
      .card.silent .again, .card.wall .again{border-color:#39414f;color:#b8b1a1}
      .card.wall .tier{border-color:#39414f;background:rgba(243,239,231,.03)}
      .card.wall .tiername{color:#e3dccb}

      .foot{margin-top:auto;padding-top:26px;text-align:center}
      .moon{display:block;margin:0 auto 10px;opacity:.85}
      .footline{color:#5f6675;font-size:12.5px;letter-spacing:.02em;margin:0}

      @media (prefers-reduced-motion:reduce){
        .card,.fill{animation:none}
      }
    `}</style>
  );
}
