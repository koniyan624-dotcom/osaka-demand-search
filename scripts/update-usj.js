// USJ（ユニバーサル・スタジオ・ジャパン）は公式サイトが本日〜約1.5ヶ月先までの
// 営業時間カレンダーを公開しているが、ページがAngular製のSPAでデータが通常の
// HTMLに含まれず、単純なfetchでは取得できない。そのためPuppeteerで実際に
// ページを描画し、レンダリング後のDOMから本日の営業時間を読み取る。
// 他の自動取得スクリプトより重い処理（ヘッドレスChromiumの起動）を伴う。
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import puppeteer from "puppeteer";
import { firebaseConfig } from "../firebase-config.js";

const SCHEDULE_URL = "https://www.usj.co.jp/web/ja/jp/park-guide/schedule/park-hour2";

// GitHub Actionsランナーの時刻はUTCのため、日本時間(JST=UTC+9、夏時間なし)に補正する。
function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function fetchUsjTodayHours() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(SCHEDULE_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForSelector("div.hour-date.ng-star-inserted", { timeout: 20000 });

    const days = await page.$$eval("div.hour-date.ng-star-inserted", (blocks) =>
      blocks.map((el) => {
        const link = el.querySelector('a[href*="date="]');
        const href = link ? link.getAttribute("href") : null;
        const text = el.textContent || "";
        const times = text.match(/\d{1,2}:\d{2}/g) || [];
        return { href, open: times[0] || null, close: times[1] || null };
      })
    );

    const today = todayJst();
    const todayEntry = days.find((d) => {
      if (!d.href) return false;
      const m = /date=(\d{2})%2F(\d{2})%2F(\d{4})/.exec(d.href);
      if (!m) return false;
      const dateStr = `${m[3]}-${m[1]}-${m[2]}`;
      return dateStr === today;
    });

    if (!todayEntry || !todayEntry.close) {
      throw new Error(`本日(${today})の営業時間が見つかりませんでした`);
    }
    return { open: todayEntry.open, close: todayEntry.close };
  } finally {
    await browser.close();
  }
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const hours = await fetchUsjTodayHours();

  await setDoc(doc(db, "venues", "auto_usj"), {
    name: "USJ（ユニバーサル・スタジオ・ジャパン）",
    city: "大阪市",
    time: hours.close,
    genre: "テーマパーク",
    days: [true, true, true, true, true, true, true],
    isSample: false,
    source: "auto",
    updatedAt: new Date().toISOString(),
  });
  console.log(`USJ: 本日 ${hours.open}〜${hours.close}`);
}

main().catch((err) => {
  console.error("USJの取得に失敗:", err.message);
  process.exit(1);
});
