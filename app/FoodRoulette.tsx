"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

type Food = { name: string; description: string; tags: [string, string]; image: string; position: string; backgroundSize: string };
type FoodCopy = [string, string, string, string];

const positions4 = ["0%", "33.333%", "66.667%", "100%"];
const positions5 = ["0%", "25%", "50%", "75%", "100%"];
const sprite4 = (column: number, row: number) => ({ image: "/food-roulette-sprite.webp", position: `${positions4[column]} ${row ? "100%" : "0%"}`, backgroundSize: "400% 200%" });
const sprite5 = (index: number) => {
  const cell = index % 10;
  return { image: `/food-roulette-sprite-${Math.floor(index / 10) + 2}.webp`, position: `${positions5[cell % 5]} ${cell >= 5 ? "100%" : "0%"}`, backgroundSize: "500% 200%" };
};

const originalFoods: Food[] = [
  { name: "咕嘟咕嘟小火锅", description: "热气开场，今天适合边涮边聊，把疲惫一起煮掉。", tags: ["暖呼呼", "适合组队"], ...sprite4(0, 0) },
  { name: "拉面回血包", description: "一碗汤面下肚，今日份 HP 和心情同时缓慢回满。", tags: ["快速回血", "单人友好"], ...sprite4(1, 0) },
  { name: "饺子宇宙舱", description: "每一只都装着未知馅料，属于可以放心开启的盲盒。", tags: ["稳稳幸福", "主食选手"], ...sprite4(2, 0) },
  { name: "炸鸡快乐桶", description: "酥脆音效已经加载完毕，今天先把快乐值拉满再说。", tags: ["快乐暴击", "请配汽水"], ...sprite4(3, 0) },
  { name: "咖喱饭能量盘", description: "温柔但很能打，一盘解决选择困难和能量不足。", tags: ["浓郁派", "饱腹加成"], ...sprite4(0, 1) },
  { name: "寿司补给站", description: "一口一个小补给，适合想吃很多种、又不想太撑的今天。", tags: ["清爽路线", "多口味"], ...sprite4(1, 1) },
  { name: "烧烤夜行车", description: "孜然和炭火负责带路，今晚的支线任务就是多点两串。", tags: ["夜间限定", "香气加倍"], ...sprite4(2, 1) },
  { name: "麻辣烫随机池", description: "想吃什么自己夹，最后交给红汤把它们组成命运共同体。", tags: ["自由搭配", "辣度可调"], ...sprite4(3, 1) },
];

const extraFoodCopy: FoodCopy[] = [
  ["兰州牛肉面秘境", "清汤、牛肉和辣油组队出击，嗦完直接精神上线。", "汤面本命", "香菜可选"],
  ["小笼包蒸汽阵", "皮薄汤多，咬之前请先启动防烫结界。", "一笼不够", "小心爆汁"],
  ["北京烤鸭卷卷", "甜面酱一抹、薄饼一卷，仪式感和香气同时满格。", "豪华掉落", "适合分享"],
  ["麻婆豆腐盖饭", "麻、辣、烫三连击，白米饭负责稳稳接住。", "下饭王者", "微辣起步"],
  ["糖醋里脊彩蛋", "酸甜党今日胜利，外酥里嫩属于合法开挂。", "酸甜暴击", "老少皆宜"],
  ["牛肉炒饭满级版", "锅气和米粒一起起飞，普通食材也能打出满屏特效。", "锅气十足", "饱腹稳了"],
  ["馄饨云朵汤", "一口一朵软乎乎的小云，胃和心情都被接住。", "温柔路线", "汤汤水水"],
  ["卤肉饭时停术", "卤汁渗进米饭的瞬间，世界可以先暂停五分钟。", "浓香派", "扒饭加速"],
  ["葱油饼咔嚓片", "层层酥脆自带 ASMR，路过都要被香气拉进支线。", "街头补给", "趁热开吃"],
  ["川味烤鱼团本", "一条鱼承包整桌热闹，配菜才是真正的隐藏宝箱。", "多人副本", "越煮越香"],
  ["芝士汉堡叠叠乐", "肉饼、芝士、面包层层叠甲，饥饿值当场归零。", "大口满足", "热量快乐"],
  ["玛格丽特披萨盘", "番茄芝士罗勒三人小队，简单却能稳定打出高分。", "拉丝警告", "分享友好"],
  ["塔可脆壳频道", "一口下去内容丰富，接不住的馅料才是节目效果。", "脆脆出击", "风味混搭"],
  ["总汇三明治高塔", "午餐肉蔬菜整齐叠层，是可以直接携带的饱腹装备。", "便携补给", "午餐优选"],
  ["热狗面包快车", "酱料拉线完毕，适合赶时间但不想亏待嘴巴的回合。", "极速出餐", "街头风味"],
  ["芝士薯条瀑布", "薯条披上芝士斗篷，理智说够了，手却还在继续。", "邪恶宵夜", "酥脆拉丝"],
  ["鸡肉卷便携舱", "肉菜酱汁卷成一束，单手也能完成的午餐任务。", "轻装上阵", "肉菜兼备"],
  ["辣炒年糕红色警报", "软糯年糕裹满甜辣酱，辣得很忙但筷子停不下来。", "韩味上线", "糯叽叽"],
  ["煎饼果子晨间番", "薄脆咔嚓一响，新的一天就算正式开播。", "早餐王牌", "加蛋快乐"],
  ["广式肠粉滑行术", "软滑米皮带着酱油一路冲线，早起也值得原谅。", "软滑派", "早茶时间"],
  ["炸猪排黄金装", "金黄脆壳配卷心菜，今天的主角光环很酥。", "日式定食", "酥脆满点"],
  ["狐狸乌冬暖炉", "甜口豆皮趴在热汤里，软乎乎地把疲惫融掉。", "治愈热汤", "软萌豆皮"],
  ["天妇罗闪光包", "虾和蔬菜披上轻薄金甲，咔嚓就是今日必杀音效。", "轻盈酥脆", "蘸汁更香"],
  ["石锅拌饭调色盘", "把彩色配菜全部拌匀，锅巴是留到最后的隐藏奖励。", "营养组队", "锅巴彩蛋"],
  ["韩式炸鸡连击", "甜辣酱牢牢挂住脆皮，第一块只是连招起手。", "追番伴侣", "甜辣上头"],
  ["越南河粉清风局", "香草、青柠和热汤清爽会合，嗦一口刷新状态栏。", "清爽汤粉", "香草加成"],
  ["泰式炒粉酸甜技", "虾、花生和青柠同屏，酸甜咸香一个都不缺席。", "东南亚风", "口味丰富"],
  ["绿咖喱魔法锅", "椰香先温柔登场，随后香辣悄悄补上一刀。", "椰香浓郁", "拌饭一绝"],
  ["叻沙双倍汤池", "椰奶与香料开了双倍经验，面和汤都不能剩。", "南洋浓汤", "微辣开胃"],
  ["越南法棍脆皮号", "外壳咔嚓、内里满载，是面包系的高机动选手。", "外脆内香", "便携午餐"],
  ["桂林米粉山水图", "卤水、肉片和花生排好队，一碗就是完整风景。", "嗦粉时间", "卤香路线"],
  ["螺蛳粉结界", "气味是入场口令，酸笋辣油才是让人回头的真本体。", "真香定律", "酸辣上头"],
  ["油泼宽面大招", "热油一泼香气炸场，宽面负责把每滴辣子都接稳。", "面条豪迈", "油泼灵魂"],
  ["广式煲仔饭锅巴", "腊味油香一路渗透，锅底那圈焦脆请务必留给自己。", "锅巴必抢", "腊味浓香"],
  ["海南鸡饭温柔刀", "鸡肉嫩、米饭香、蘸料亮眼，低调却招招命中。", "清爽肉食", "蘸酱三选"],
  ["辣子鸡火焰阵", "在辣椒山里寻宝，找到一块鸡肉就是小小胜利。", "辣度警告", "下酒搭档"],
  ["回锅肉饭扫光", "肉片和青椒联手，白米饭很难完整走出这一局。", "川味家常", "米饭杀手"],
  ["骨头汤续航瓶", "慢慢炖出的温暖补给，适合给忙碌的一天加点续航。", "暖胃模式", "慢炖鲜香"],
  ["清蒸鱼鲜味频道", "葱姜热油一浇，鲜味直播间立刻全员在线。", "清鲜路线", "聚餐担当"],
  ["炸酱面拌拌乐", "菜码负责清爽，炸酱负责浓郁，拌匀就是正确答案。", "京味选手", "大口拌面"],
  ["白粥小菜存档点", "清清淡淡地存个档，胃也需要偶尔进入休息模式。", "温和养胃", "早餐可用"],
  ["鸡蛋沙拉三明治", "软面包夹着绵密蛋香，是不会抢戏但很可靠的角色。", "柔软治愈", "轻松一餐"],
  ["牛油果鸡肉草原", "绿色能量和鸡肉小队集结，吃饱也能保持轻盈。", "清爽高蛋白", "蔬菜很多"],
  ["三文鱼波奇宝箱", "打开碗就是满屏彩色素材，想怎么搭配都不容易翻车。", "鲜活配色", "自由混搭"],
  ["酸奶水果星云", "莓果、香蕉和燕麦漂在酸奶宇宙，轻盈甜度刚刚好。", "甜而不腻", "早餐甜品"],
  ["蓝莓松饼软绵云", "松软叠成三层云，枫糖浆负责制造甜蜜天气。", "甜党集合", "周末早餐"],
  ["莓果华夫格地图", "沿着格子铺满水果和奶油，每一口都有不同路线。", "脆软并存", "拍照好看"],
  ["番茄浓汤暖手炉", "酸甜浓汤配烤面包，阴天也能获得橙红色好心情。", "暖呼呼", "蘸面包绝配"],
  ["芝士欧姆蛋被窝", "切开就是融化芝士，今天允许在柔软里多躺一会。", "蛋香绵软", "芝士内馅"],
  ["烤红薯冬日核心", "掰开冒着热气和甜香，是朴素但超强的回血道具。", "自然甜味", "暖手暖胃"],
];

const foods: Food[] = [...originalFoods, ...extraFoodCopy.map(([name, description, firstTag, secondTag], index) => ({ name, description, tags: [firstTag, secondTag] as [string, string], ...sprite5(index) }))];

function getDailyFoodIndex() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return Array.from(today).reduce((sum, character) => sum + character.charCodeAt(0), 0) % foods.length;
}

export default function FoodRoulette() {
  const [selectedIndex, setSelectedIndex] = useState(getDailyFoodIndex);
  const [rolling, setRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);
  const timerRef = useRef<number | null>(null);
  const selected = foods[selectedIndex];

  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  function rollFood() {
    if (rolling) return;
    setRolling(true);
    timerRef.current = window.setTimeout(() => {
      setSelectedIndex((current) => {
        let next = Math.floor(Math.random() * foods.length);
        if (next === current) next = (next + 1) % foods.length;
        return next;
      });
      setHasRolled(true);
      setRolling(false);
      timerRef.current = null;
    }, 720);
  }

  return (
    <section className="food-roulette shell" id="food-roulette" aria-labelledby="food-roulette-title">
      <div className={`food-roulette-card${rolling ? " is-rolling" : ""}`}>
        <div className="food-visual-wrap">
          <div className="food-visual" key={selectedIndex} role="img" aria-label={`${selected.name}的美食插画`} style={{ backgroundImage: `url(${selected.image})`, backgroundPosition: selected.position, backgroundSize: selected.backgroundSize }} />
          <span className="food-drop-label">TODAY&apos;S DROP</span>
          <i className="food-spark spark-one" aria-hidden="true"><Icon name="spark" /></i>
          <i className="food-spark spark-two" aria-hidden="true"><Icon name="food" /></i>
        </div>
        <div className="food-roulette-copy">
          <p>DAILY QUEST / 今天吃什么</p>
          <div className="food-result-meta">
            <span>{hasRolled ? "本次摇奖结果" : "今日推荐掉落"}</span>
            <small>{String(selectedIndex + 1).padStart(2, "0")} / {String(foods.length).padStart(2, "0")}</small>
          </div>
          <h2 id="food-roulette-title" aria-live="polite">{rolling ? "命运读取中…" : selected.name}</h2>
          <p className="food-description">{rolling ? "菜单正在高速旋转，请稍等一下下。" : selected.description}</p>
          <div className="food-tags" aria-label="推荐特点">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          <button type="button" onClick={rollFood} disabled={rolling}><span aria-hidden="true"><Icon name="spark" /></span>{rolling ? "正在摇奖…" : "摇一摇，换一个"}</button>
          <small className="food-hint">58 道候选待命，选择困难就交给命运之骰。</small>
        </div>
      </div>
    </section>
  );
}
