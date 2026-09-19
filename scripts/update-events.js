// 主要コンサートホール・スタジアムの公式サイトから公演スケジュールを自動取得しFirestoreに反映する。
// 各会場サイトは「開演」時刻までは公開しているが「終演」時刻は公開していないため、
// 終演予定時刻は「開演 + 目安の上演時間」で推定する（画面側では目安である旨を明示する想定）。
// いずれも公式サイトのHTML構造に依存した非公式スクレイピングのため、
// サイトのリニューアル等で予告なく取得できなくなる可能性がある。
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { firebaseConfig } from "../firebase-config.js";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function estimateEndTime(startHHMM, hours = 2.5) {
  const [h, m] = startHHMM.split(":").map(Number);
  const total = h * 60 + m + Math.round(hours * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${eh}:${pad2(em)}`;
}

function slug(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#039": "'", nbsp: " " };
function decodeEntities(text) {
  return text.replace(/&(amp|lt|gt|quot|#039|nbsp);/g, (_, e) => ENTITIES[e]);
}

// ---------- 大阪城ホール ----------
async function fetchOsakaJoHall() {
  const res = await fetch("https://www.osaka-johall.com/event/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const chunks = html.split('<dt class="event-genre">').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const dateM = /<span class="date">(\d{4})\/(\d{2})\/(\d{2})<\/span>/.exec(chunk);
    const genreM = /<span class="bg">([^<]*)<\/span>/.exec(chunk);
    const titleM = /<dt class="event-ttl"><a[^>]*>([^<]*)<\/a>/.exec(chunk);
    const startM = /<span class="d-ttl">開演<\/span>\s*<span class="d-txt">(\d{1,2}:\d{2})<\/span>/.exec(chunk);
    if (!dateM || !titleM || !startM) continue;
    events.push({
      venue: "大阪城ホール",
      title: decodeEntities(titleM[1].trim()),
      date: `${dateM[1]}-${dateM[2]}-${dateM[3]}`,
      endTime: estimateEndTime(startM[1]),
      city: "大阪市",
      genre: genreM ? decodeEntities(genreM[1].trim()) : "",
    });
  }
  return events;
}

// ---------- 京セラドーム大阪 ----------
async function fetchKyoceraDome() {
  const res = await fetch("https://www.kyoceradome-osaka.jp/schedule/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const chunks = html.split('<section class="event-box').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const dateM = /(\d{4})年(\d{2})月(\d{2})日/.exec(chunk);
    const titleM = /<h2>([^<]*)<\/h2>/.exec(chunk);
    const genreM = /<h2>[^<]*<\/h2>\s*<span>([^<]*)<\/span>/.exec(chunk);
    const startM = /開始時間[:：](\d{1,2}:\d{2})/.exec(chunk);
    if (!dateM || !titleM || !startM) continue;
    const genre = genreM ? decodeEntities(genreM[1].trim()) : "";
    events.push({
      venue: "京セラドーム大阪",
      title: decodeEntities(titleM[1].trim()),
      date: `${dateM[1]}-${dateM[2]}-${dateM[3]}`,
      endTime: estimateEndTime(startM[1], genre.includes("野球") ? 3.5 : 2.5),
      city: "大阪市",
      genre,
    });
  }
  return events;
}

// ---------- フェスティバルホール（当月分のみ掲載） ----------
async function fetchFestivalHall() {
  const res = await fetch("https://www.festivalhall.jp/events/list/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const chunks = html.split('<li><div class="performance-info">').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const dayM = /<p class="_date"><span>(\d{1,2})<\/span>/.exec(chunk);
    const titleM = /<h2 class="_title"><a[^>]*>([^<]*)<\/a>/.exec(chunk);
    const startM = /<th>開演<\/th><td>(\d{1,2}:\d{2})<\/td>/.exec(chunk);
    if (!dayM || !titleM || !startM) continue;
    events.push({
      venue: "フェスティバルホール",
      title: decodeEntities(titleM[1].trim()),
      date: `${year}-${pad2(month)}-${pad2(Number(dayM[1]))}`,
      endTime: estimateEndTime(startM[1]),
      city: "大阪市",
      genre: "コンサート",
    });
  }
  return events;
}

// ---------- なんばHatch（当月分） ----------
async function fetchNambaHatch() {
  const res = await fetch("http://www.namba-hatch.com/schedule.php?add=0");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const captionM = /<caption>(\d{4})年(\d{1,2})月<\/caption>/.exec(html);
  if (!captionM) throw new Error("月ヘッダーが見つからない");
  const year = captionM[1];
  const rows = html.split("<tr>").slice(1);
  const events = [];
  for (const row of rows) {
    const dayM = /<th>(\d{1,2})\/(\d{1,2})<br>/.exec(row);
    const titleM = /<div class="eventTitle">([^<]*)/.exec(row);
    const timeM = /《時間》[^<]*?(\d{1,2}:\d{2})\s*Start/.exec(row);
    if (!dayM || !titleM || !timeM) continue;
    events.push({
      venue: "なんばHatch",
      title: decodeEntities(titleM[1].trim()),
      date: `${year}-${pad2(Number(dayM[1]))}-${pad2(Number(dayM[2]))}`,
      endTime: estimateEndTime(timeM[1]),
      city: "大阪市",
      genre: "ライブ",
    });
  }
  return events;
}

// ---------- Zepp Osaka Bayside ----------
async function fetchZeppOsakaBayside() {
  const res = await fetch("https://www.zepp.co.jp/hall/osakabayside/schedule/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const chunks = html.split('<div class="sch-content-date__inner">').slice(1);
  const events = [];
  for (const chunk of chunks) {
    const yearM = /sch-content-date__year">(\d{4})</.exec(chunk);
    const monthDayM = /sch-content-date__month">(\d{1,2})\.(\d{1,2})</.exec(chunk);
    const titleM = /sch-content-text__ttl">([^<]*)</.exec(chunk) || /sch-content-text__performer">([^<]*)</.exec(chunk);
    const startM = /sch-content-text-date__start">(\d{1,2}:\d{2})</.exec(chunk);
    if (!yearM || !monthDayM || !titleM || !startM) continue;
    events.push({
      venue: "Zepp Osaka Bayside",
      title: decodeEntities(titleM[1].trim()),
      date: `${yearM[1]}-${pad2(Number(monthDayM[1]))}-${pad2(Number(monthDayM[2]))}`,
      endTime: estimateEndTime(startM[1]),
      city: "大阪市",
      genre: "ライブ",
    });
  }
  return events;
}

// ---------- 長居スタジアム（セレッソ大阪ホームゲーム） ----------
async function fetchNagaiStadium() {
  const res = await fetch("https://www.cerezo.jp/matches/");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("__NEXT_DATA__ が見つからない");
  const data = JSON.parse(m[1]);
  const games = data?.props?.pageProps?.games ?? [];
  const now = new Date();
  const events = [];
  for (const g of games) {
    if (g.api?.hv !== "ホーム") continue;
    const d = new Date(g.date);
    if (Number.isNaN(d.getTime()) || d < now) continue;
    const kickoff = g.api?.kickoff;
    if (!kickoff || kickoff.length < 3) continue;
    const startTime = `${kickoff.slice(0, kickoff.length - 2)}:${kickoff.slice(-2)}`;
    events.push({
      venue: "長居スタジアム",
      title: g.game_kind || "セレッソ大阪ホームゲーム",
      date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
      endTime: estimateEndTime(startTime, 2),
      city: "大阪市",
      genre: "スポーツ",
    });
  }
  return events;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const fetchers = [
    ["大阪城ホール", fetchOsakaJoHall],
    ["京セラドーム大阪", fetchKyoceraDome],
    ["フェスティバルホール", fetchFestivalHall],
    ["なんばHatch", fetchNambaHatch],
    ["Zepp Osaka Bayside", fetchZeppOsakaBayside],
    ["長居スタジアム", fetchNagaiStadium],
  ];

  for (const [label, fetcher] of fetchers) {
    let events;
    try {
      events = await fetcher();
    } catch (err) {
      console.error(`${label}の取得に失敗（今回はスキップ）: ${err.message}`);
      continue;
    }
    let i = 0;
    for (const ev of events) {
      const id = `auto_${slug(ev.venue)}_${ev.date}_${i++}`;
      await setDoc(doc(db, "events", id), {
        ...ev,
        isSample: false,
        source: "auto",
        updatedAt: new Date().toISOString(),
      });
    }
    console.log(`${label}: ${events.length}件`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
