"use client";
import { useState } from "react";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState("idle"); // idle | asking | done
  const [result, setResult] = useState(null);

  async function ask() {
    if (question.trim().length < 3 || state === "asking") return;
    setState("asking");
    setResult(null);
    try {
      const res = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, domain: "relationships" }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ status: "error", message: "The oracle could not be reached." });
    }
    setState("done");
  }

  function reset() {
    setState("idle");
    setResult(null);
    setQuestion("");
  }

  return (
    <main className="wrap">
      <Styles />
      <header className="masthead">
        <div className="mark">✶</div>
        <h1>TESSOMANCY</h1>
        <p className="tag">the odds, honestly</p>
      </header>

      {state !== "done" && (
        <section className="asker">
          <p className="prompt">
            Ask about a relationship. Not <em>your</em> person — the oracle reads the
            odds for situations like yours, drawn from real data.
          </p>
          <textarea
            className="field"
            rows={3}
            placeholder="e.g. We married at 24, both finished college, no prior marriages — will it last?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={state === "asking"}
          />
          <button className="cast" onClick={ask} disabled={state === "asking" || question.trim().length < 3}>
            {state === "asking" ? "reading the leaves…" : "cast"}
          </button>
          <p className="fineprint">
            No account. No name. Questions are remembered; people are not.
          </p>
        </section>
      )}

      {state === "done" && result && <Verdict result={result} onAgain={reset} />}

      <footer className="foot">
        A probabilistic reading, not advice. Not a wager.
      </footer>
    </main>
  );
}

function Verdict({ result, onAgain }) {
  if (result.status === "spoken") {
    return (
      <section className="card spoken">
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
        <div className="mirror">
          <span className="mlabel">the mirror</span>
          <p>{result.mirror}</p>
        </div>
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
        <button className="again" onClick={onAgain}>ask another</button>
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
      .mark{color:var(--gold);font-size:20px;letter-spacing:2px;opacity:.85}
      .masthead h1{
        font-family:'Fraunces',serif;font-weight:600;
        font-size:30px;letter-spacing:.14em;margin:6px 0 2px;
        color:var(--porcelain);
      }
      .tag{font-style:italic;color:var(--leaf-soft);margin:0;font-size:15px;letter-spacing:.02em}

      .asker{margin-top:8px}
      .prompt{color:#cfc8b8;font-size:16px;line-height:1.55;margin:0 0 18px}
      .prompt em{color:var(--gold);font-style:italic}
      .field{
        width:100%;background:rgba(243,239,231,.04);
        border:1px solid var(--ink2);border-radius:14px;
        color:var(--porcelain);font-family:'Newsreader',serif;font-size:17px;
        padding:15px 16px;line-height:1.5;resize:none;outline:none;
      }
      .field:focus{border-color:var(--leaf-soft);background:rgba(243,239,231,.06)}
      .field::placeholder{color:#7c8394}
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

      .card{
        margin-top:6px;background:linear-gradient(180deg,#f6f2ea 0%,#efe9dd 100%);
        color:var(--ink);border-radius:18px;padding:24px 22px 20px;
        box-shadow:0 20px 60px rgba(0,0,0,.45), 0 2px 0 rgba(255,255,255,.4) inset;
        animation:rise .5s cubic-bezier(.2,.7,.2,1) both;
      }
      @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
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
      .walltext{font-size:17px;line-height:1.6;color:#e3dccb;margin:2px 2px 4px}
      .card.silent .again, .card.wall .again{border-color:#39414f;color:#b8b1a1}

      .foot{margin-top:auto;padding-top:26px;text-align:center;color:#5f6675;font-size:12.5px;letter-spacing:.02em}

      @media (prefers-reduced-motion:reduce){
        .card,.fill{animation:none}
      }
    `}</style>
  );
}
