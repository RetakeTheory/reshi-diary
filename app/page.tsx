const projects = [
  {
    index: "01", title: "微光旅行", type: "品牌体验 / 2026",
    summary: "为城市短途旅行设计的一套轻量品牌与数字产品，让计划旅程像翻开一本杂志。",
    tone: "coral", mark: "WEEKEND\nSLOWLY",
  },
  {
    index: "02", title: "见山笔记", type: "产品设计 / 2025",
    summary: "一个帮助创作者整理碎片灵感、重新发现内容之间联系的写作空间。",
    tone: "blue", mark: "IDEAS\nCONNECT",
  },
  {
    index: "03", title: "寻常咖啡", type: "网站设计 / 2025",
    summary: "从一杯日常咖啡出发，建立温暖、克制又有辨识度的线上品牌体验。",
    tone: "green", mark: "DAILY\nRITUAL",
  },
];

const notes = [
  { date: "08.12", title: "好设计，往往从删掉一个答案开始" },
  { date: "07.28", title: "我如何为一个新项目寻找视觉语气" },
  { date: "06.09", title: "把灵感变成系统，而不是收藏夹" },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="主导航">
        <a className="logo" href="#top" aria-label="林屿的个人主页">LY<span>●</span></a>
        <div className="nav-links"><a href="#work">项目</a><a href="#about">关于</a><a href="#notes">笔记</a></div>
        <a className="nav-contact" href="mailto:hello@example.com">联系我 <span aria-hidden="true">↗</span></a>
      </nav>

      <header className="hero shell" id="top">
        <div className="availability"><i /> 接受 2026 年秋季合作</div>
        <h1>设计有温度的<br /><em>数字体验。</em></h1>
        <div className="hero-foot">
          <p>你好，我是林屿，一名独立产品设计师与前端开发者。<br />我用设计与代码，把复杂想法变成清晰、好用的产品。</p>
          <a href="#work" className="scroll-hint"><span>向下探索</span><b aria-hidden="true">↓</b></a>
        </div>
      </header>

      <section className="projects shell" id="work" aria-labelledby="work-title">
        <div className="section-heading"><p>精选项目 / SELECTED WORK</p><h2 id="work-title">最近做的事</h2></div>
        <div className="project-list">
          {projects.map((project) => (
            <article className="project" key={project.index}>
              <div className={`project-visual ${project.tone}`} aria-hidden="true">
                <span>{project.index}</span>
                <strong>{project.mark.split("\n").map((line) => <span key={line}>{line}</span>)}</strong>
                <div className="shape shape-one" /><div className="shape shape-two" />
              </div>
              <div className="project-copy">
                <p>{project.type}</p><h3>{project.title}</h3><span>{project.summary}</span>
                <a href="#contact" aria-label={`了解${project.title}项目`}>查看项目 <b aria-hidden="true">↗</b></a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about" id="about" aria-labelledby="about-title">
        <div className="shell about-grid">
          <p className="eyebrow">关于我 / ABOUT</p>
          <div className="about-copy">
            <h2 id="about-title">好的体验不必大声，<br /><em>但应该被记住。</em></h2>
            <div className="about-columns">
              <p>过去 8 年，我为初创团队与成熟品牌设计数字产品，工作横跨策略、视觉与前端实现。</p>
              <p>工作之外，我在记录城市、冲煮咖啡，也持续写下关于设计、技术和独立工作的思考。</p>
            </div>
            <dl>
              <div><dt>现在</dt><dd>独立设计师</dd></div><div><dt>坐标</dt><dd>深圳 / 远程</dd></div><div><dt>专注</dt><dd>品牌 · 产品 · 网站</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="notes shell" id="notes" aria-labelledby="notes-title">
        <div className="section-heading notes-title"><p>随手记 / NOTES</p><h2 id="notes-title">偶尔写点东西</h2></div>
        <div className="note-list">
          {notes.map((note) => (
            <a href="#contact" className="note" key={note.date}>
              <time dateTime={`2026-${note.date.replace(".", "-")}`}>{note.date}</time><h3>{note.title}</h3><span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </section>

      <footer id="contact">
        <div className="shell footer-main"><p>有一个想法？</p><h2>一起做点好东西。</h2><a href="mailto:hello@example.com">hello@example.com <span aria-hidden="true">↗</span></a></div>
        <div className="shell footer-meta"><p>© 2026 林屿</p><div><a href="#">小红书</a><a href="#">即刻</a><a href="#">GitHub</a></div><a href="#top">回到顶部 ↑</a></div>
      </footer>
    </main>
  );
}
