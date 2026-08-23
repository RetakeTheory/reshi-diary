"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import EditableModule from "./EditableModule";
import EditableText from "./EditableText";
import { pageModule, splitDisplayText } from "../lib/site-pages";

const MAX_RESULT_COUNT = 10000;
const editableModule = pageModule("randomNumber", "random-widget");
const copy = editableModule.fields;

function parsePositiveInteger(value: string) {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function drawUniqueNumbers(maximum: number, count: number) {
  const selected = new Set<number>();
  for (let current = maximum - count + 1; current <= maximum; current += 1) {
    const candidate = Math.floor(Math.random() * current) + 1;
    selected.add(selected.has(candidate) ? current : candidate);
  }

  const results = Array.from(selected);
  for (let index = results.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [results[index], results[target]] = [results[target], results[index]];
  }
  return results;
}

export default function RandomNumberPicker() {
  const [maximum, setMaximum] = useState("100");
  const [count, setCount] = useState("1");
  const [results, setResults] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [rolling, setRolling] = useState(false);
  const timerRef = useRef<number | null>(null);
  const title = splitDisplayText(copy.title);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  function handleDraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedMaximum = parsePositiveInteger(maximum);
    const parsedCount = parsePositiveInteger(count);

    if (parsedMaximum === null || parsedCount === null) {
      setError("这里只收正整数，零、负数、小数和科学计数法都会被门卫拦下。");
      return;
    }
    if (parsedCount > parsedMaximum) {
      setError("抽取数量不能比数字上限还大，不重复模式会当场卡关。");
      return;
    }
    if (parsedCount > MAX_RESULT_COUNT) {
      setError(`一次最多抽 ${MAX_RESULT_COUNT.toLocaleString("zh-CN")} 个，不然结果区会变成数字瀑布。`);
      return;
    }

    setError("");
    setRolling(true);
    timerRef.current = window.setTimeout(() => {
      setResults(drawUniqueNumbers(parsedMaximum, parsedCount));
      setRolling(false);
      timerRef.current = null;
    }, 460);
  }

  return (
    <EditableModule module={editableModule}><section className="number-picker shell" aria-labelledby="number-picker-title">
      <div className={`number-picker-card${rolling ? " is-rolling" : ""}`}>
        <div className="number-picker-copy">
          <p>{copy.eyebrow}</p>
          <h1 id="number-picker-title">{title.lead}{title.accent && <><br /><span><EditableText text={title.accent} /></span></>}</h1>
          <p>{copy.description}</p>
          <div className="number-rules"><span>仅限正整数</span><span>结果不重复</span><span>最多 10,000 个</span></div>
        </div>

        <div className="number-console">
          <form onSubmit={handleDraw} noValidate>
            <div className="number-fields">
              <label>
                <span>{copy.maximumLabel}</span>
                <input value={maximum} onChange={(event) => setMaximum(event.target.value)} inputMode="numeric" pattern="[1-9][0-9]*" placeholder="例如 100" aria-describedby="number-error" />
                <small>抽取范围：1 ～ {parsePositiveInteger(maximum)?.toLocaleString("zh-CN") ?? "?"}</small>
              </label>
              <label>
                <span>{copy.countLabel}</span>
                <input value={count} onChange={(event) => setCount(event.target.value)} inputMode="numeric" pattern="[1-9][0-9]*" placeholder="例如 3" aria-describedby="number-error" />
                <small>每个数字只会出现一次</small>
              </label>
            </div>
            <button type="submit" disabled={rolling}><span aria-hidden="true"><Icon name="spark" /></span>{rolling ? copy.buttonBusy : copy.button}</button>
            <p className={`number-error${error ? " is-visible" : ""}`} id="number-error" role="alert">{error || "请输入两个正整数，然后把剩下的交给随机数。"}</p>
          </form>

          <div className="number-results" aria-live="polite" aria-busy={rolling}>
            {rolling ? <div className="number-loading" aria-label="正在抽取"><i /><i /><i /></div> : results.length > 0 ? <>
              <div className="number-results-head"><span>本次掉落</span><small>{results.length} 个数字</small></div>
              <div className="number-chip-grid">{results.map((result, index) => <b key={result} style={{ animationDelay: `${Math.min(index, 20) * 24}ms` }}>{result.toLocaleString("zh-CN")}</b>)}</div>
            </> : <div className="number-empty"><b>?</b><span>{copy.empty}</span></div>}
          </div>
        </div>
      </div>
    </section></EditableModule>
  );
}
