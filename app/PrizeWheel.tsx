"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";

type Prize = { id: number; name: string; weight: string };
type ProbabilityMode = "equal" | "weighted";

const colors = ["#7657f6", "#f06f9d", "#45bda1", "#f5a253", "#4a9ee8", "#a66ee8", "#ef6c62", "#70b85b", "#e3bb42", "#5b74dc", "#d969bd", "#35a8aa"];
const initialPrizes: Prize[] = [
  { id: 1, name: "奶茶一杯", weight: "1" },
  { id: 2, name: "炸鸡时间", weight: "1" },
  { id: 3, name: "再睡五分钟", weight: "1" },
  { id: 4, name: "出门散步", weight: "1" },
];

export default function PrizeWheel() {
  const [prizes, setPrizes] = useState(initialPrizes);
  const [mode, setMode] = useState<ProbabilityMode>("equal");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const nextId = useRef(5);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const segments = useMemo(() => {
    const weights = prizes.map((prize) => mode === "equal" ? 1 : Math.max(0, Number(prize.weight) || 0));
    const total = weights.reduce((sum, weight) => sum + weight, 0) || prizes.length || 1;
    return prizes.map((prize, index) => {
      const cursor = weights.slice(0, index).reduce((sum, weight) => sum + weight, 0) / total * 360;
      const size = weights[index] / total * 360;
      const segment = { ...prize, color: colors[index % colors.length], start: cursor, end: cursor + size, center: cursor + size / 2, probability: weights[index] / total * 100 };
      return segment;
    });
  }, [mode, prizes]);

  const wheelGradient = `conic-gradient(from -90deg, ${segments.map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`).join(", ")})`;

  function updatePrize(id: number, field: "name" | "weight", value: string) {
    setPrizes((current) => current.map((prize) => prize.id === id ? { ...prize, [field]: value } : prize));
    setResult(""); setError("");
  }

  function addPrize() {
    if (prizes.length >= 12) { setError("转盘最多放 12 个奖项，再多文字就要挤成异世界语言了。"); return; }
    setPrizes((current) => [...current, { id: nextId.current++, name: `新奖项 ${current.length + 1}`, weight: "1" }]);
    setResult(""); setError("");
  }

  function removePrize(id: number) {
    if (prizes.length <= 2) { setError("至少保留两个奖项，不然转盘会失去悬念。"); return; }
    setPrizes((current) => current.filter((prize) => prize.id !== id));
    setResult(""); setError("");
  }

  function spin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (spinning) return;
    if (prizes.some((prize) => !prize.name.trim())) { setError("还有奖项没有名字，先给它一个称号吧。"); return; }

    const weights = prizes.map((prize) => mode === "equal" ? 1 : Number(prize.weight));
    if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) { setError("自定义权重必须是大于 0 的数字，小数也可以。"); return; }

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let ticket = Math.random() * total;
    let selectedIndex = weights.length - 1;
    for (let index = 0; index < weights.length; index += 1) {
      ticket -= weights[index];
      if (ticket < 0) { selectedIndex = index; break; }
    }

    const selectedSegment = segments[selectedIndex];
    const currentAngle = ((rotation % 360) + 360) % 360;
    const landingAngle = (360 - selectedSegment.center) % 360;
    const nextRotation = rotation + 5 * 360 + ((landingAngle - currentAngle + 360) % 360);
    setError(""); setResult(""); setSpinning(true); setRotation(nextRotation);
    timerRef.current = window.setTimeout(() => {
      setResult(prizes[selectedIndex].name.trim());
      setSpinning(false); timerRef.current = null;
    }, 4200);
  }

  return (
    <section className="prize-wheel shell" aria-labelledby="prize-wheel-title">
      <div className="prize-wheel-card">
        <div className="wheel-stage">
          <div className="wheel-pointer" aria-hidden="true" />
          <div className="wheel-disc" role="img" aria-label={`抽奖转盘，共 ${prizes.length} 个奖项`} style={{ background: wheelGradient, transform: `rotate(${rotation}deg)` }}>
            {segments.map((segment) => {
              const angle = (segment.center - 90) * Math.PI / 180;
              return <span key={segment.id} style={{ left: `${50 + Math.cos(angle) * 34}%`, top: `${50 + Math.sin(angle) * 34}%`, transform: `translate(-50%, -50%) rotate(${segment.center}deg)` }}>{segment.name.trim() || "未命名"}</span>;
            })}
            <i aria-hidden="true"><Icon name="spark" /></i>
          </div>
          <div className={`wheel-result${result ? " has-result" : ""}`} aria-live="polite"><small>{spinning ? "命运正在结算" : result ? "本次抽中" : "LUCKY DRAW"}</small><b>{spinning ? "转盘高速旋转中…" : result || "奖品还藏着"}</b></div>
        </div>

        <div className="wheel-editor">
          <p>PRIZE WHEEL / 自定义抽奖</p>
          <h1 id="prize-wheel-title">把奖项放上来，<br /><span>让转盘开口。</span></h1>
          <div className="probability-mode" aria-label="概率模式">
            <button type="button" className={mode === "equal" ? "active" : ""} onClick={() => { setMode("equal"); setResult(""); }}>平分概率</button>
            <button type="button" className={mode === "weighted" ? "active" : ""} onClick={() => { setMode("weighted"); setResult(""); }}>自定义权重</button>
          </div>
          <form onSubmit={spin}>
            <div className="prize-list">
              {prizes.map((prize, index) => <div className="prize-row" key={prize.id}>
                <i style={{ background: colors[index % colors.length] }} aria-hidden="true" />
                <input value={prize.name} disabled={spinning} maxLength={24} onChange={(event) => updatePrize(prize.id, "name", event.target.value)} aria-label={`奖项 ${index + 1} 名称`} />
                {mode === "weighted" ? <label><span>权重</span><input value={prize.weight} disabled={spinning} inputMode="decimal" onChange={(event) => updatePrize(prize.id, "weight", event.target.value)} aria-label={`${prize.name || `奖项 ${index + 1}`}的权重`} /></label> : <small>{segmentProbability(segments[index]?.probability)}</small>}
                <button type="button" disabled={spinning || prizes.length <= 2} onClick={() => removePrize(prize.id)} aria-label={`删除${prize.name || `奖项 ${index + 1}`}`}><Icon name="trash" /></button>
              </div>)}
            </div>
            <button className="add-prize" type="button" disabled={spinning || prizes.length >= 12} onClick={addPrize}><Icon name="plus" /> 添加奖项</button>
            <button className="spin-wheel" type="submit" disabled={spinning}><span aria-hidden="true"><Icon name="spark" /></span>{spinning ? "正在转动…" : "转起来！"}</button>
            <p className={`wheel-error${error ? " is-visible" : ""}`} role="alert">{error || (mode === "equal" ? "当前每个奖项概率完全相同。" : "权重越大越容易被抽中，不要求权重加起来等于 100。")}</p>
          </form>
        </div>
      </div>
    </section>
  );
}

function segmentProbability(probability = 0) {
  return `${probability.toFixed(probability < 1 ? 2 : 1)}%`;
}
