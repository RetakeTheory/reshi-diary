import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("bash", bash); hljs.registerLanguage("c", c); hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp); hljs.registerLanguage("css", css); hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java); hljs.registerLanguage("javascript", javascript); hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown); hljs.registerLanguage("plaintext", plaintext); hljs.registerLanguage("python", python);
hljs.registerLanguage("ruby", ruby); hljs.registerLanguage("rust", rust); hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript); hljs.registerLanguage("xml", xml);

export const codeLanguages = [
  { value: "auto", label: "自动识别" }, { value: "cpp", label: "C++" }, { value: "c", label: "C" },
  { value: "python", label: "Python" }, { value: "rust", label: "Rust" }, { value: "ruby", label: "Ruby" },
  { value: "javascript", label: "JavaScript" }, { value: "typescript", label: "TypeScript" }, { value: "java", label: "Java" },
  { value: "csharp", label: "C#" }, { value: "go", label: "Go" }, { value: "bash", label: "Shell / Bash" },
  { value: "json", label: "JSON" }, { value: "xml", label: "HTML / XML" }, { value: "css", label: "CSS" },
  { value: "sql", label: "SQL" }, { value: "markdown", label: "Markdown" }, { value: "plaintext", label: "纯文本" },
] as const;

const detectableLanguages = codeLanguages.map((item) => item.value).filter((language) => language !== "auto" && language !== "plaintext");

export function highlightSource(source: string, requestedLanguage = "auto") {
  if (requestedLanguage !== "auto" && hljs.getLanguage(requestedLanguage)) {
    const result = hljs.highlight(source, { language: requestedLanguage, ignoreIllegals: true });
    return { html: result.value, language: requestedLanguage };
  }
  const result = hljs.highlightAuto(source, detectableLanguages);
  return { html: result.value, language: result.language || "plaintext" };
}

export function highlightCodeBlocks(container: HTMLElement | null) {
  container?.querySelectorAll<HTMLElement>("pre code").forEach((code) => {
    const pre = code.parentElement;
    const requestedLanguage = code.dataset.language || pre?.dataset.language || "auto";
    const source = code.textContent || "";
    const result = highlightSource(source, requestedLanguage);
    code.innerHTML = result.html;
    code.className = `hljs language-${result.language}`;
    code.dataset.language = requestedLanguage;
    if (pre) pre.dataset.language = codeLanguages.find((item) => item.value === result.language)?.label || result.language.toUpperCase();
  });
}
