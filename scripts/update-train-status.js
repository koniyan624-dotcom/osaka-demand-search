// 各鉄道会社の非公式・準公式エンドポイントを10分おきに参照し、運行状況を自動でFirestoreに反映する。
// いずれも公式にサポートされたAPIではないため、各社の仕様変更で予告なく取得できなくなる可能性がある。
// 1社の取得に失敗しても他社の更新を止めないよう、会社ごとにtry/catchで区切っている。
//
// 大阪メトロについては、運行情報の二次利用を明示的に禁止する注意書きが公式サイトに
// 掲載されていることを確認済み。利用者の判断により自己責任で自動化を継続している。
import { initializeApp } from "firebase/app";
import { getDocs, collection, getFirestore, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "../firebase-config.js";

function classifyIssueText(text, hasIssue) {
  if (!hasIssue) return "normal";
  if (!text) return "delay";
  if (text.includes("見合わせ") || text.includes("運休")) return "suspend";
  if (text.includes("遅")) return "delay";
  return "delay";
}

// ---------- JR西日本（非公式 train-guide API） ----------
const JR_LINE_MAP = {
  kyoto: "JR京都線",
  kobesanyo: "JR神戸線",
  osakaloop: "JR大阪環状線",
  hanwahagoromo: "JR阪和線",
  osakahigashi: "JRおおさか東線",
  yamatoji: "JR大和路線",
  tozai: "JR東西線",
};

async function fetchJR() {
  const res = await fetch("https://www.train-guide.westjr.co.jp/api/v3/area_kinki_trafficinfo.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const lines = data.lines ?? {};
  return Object.entries(JR_LINE_MAP).map(([lineId, name]) => {
    const info = lines[lineId];
    const text = info ? `${info.status ?? ""}${info.cause ?? ""}` : "";
    return { name, status: classifyIssueText(text, !!info) };
  });
}

// ---------- 阪急電鉄（公式サイトのHTMLフラグメントを解析） ----------
const HANKYU_LINE_MAP = { 神戸線: "阪急神戸線", 宝塚線: "阪急宝塚線", 京都線: "阪急京都線" };

async function fetchHankyu() {
  const res = await fetch("https://www.hankyu.co.jp/railinfo/include/page_railinfo.html");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const blockRe = /<span>([^<]+)<\/span><\/h3>\s*<p[^>]*>(?:<img[^>]*>)?\s*([^<]*)<\/p>/g;
  const results = [];
  let m;
  while ((m = blockRe.exec(html))) {
    const mapped = HANKYU_LINE_MAP[m[1].trim()];
    if (!mapped) continue;
    const statusText = m[2].trim();
    results.push({ name: mapped, status: classifyIssueText(statusText, !statusText.includes("平常")) });
  }
  return results;
}

// ---------- 阪神電気鉄道（旧携帯向けサイトのJSON） ----------
async function fetchHanshin() {
  const res = await fetch("https://apl.hanshin.co.jp/data/unkou.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const infList = Array.isArray(data.inf) ? data.inf : [];
  const text = infList.map((x) => JSON.stringify(x)).join(" ");
  return [{ name: "阪神本線", status: classifyIssueText(text, infList.length > 0) }];
}

// ---------- 近畿日本鉄道（ナビタイム提供の非公式API） ----------
const KINTETSU_LINE_MAP = { 大阪線: "近鉄大阪線", 奈良線: "近鉄奈良線" };

async function fetchKintetsu() {
  const res = await fetch("https://kintetsuapp.cld.navitime.jp/production/v3/realtime/condition/all");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const results = [];
  for (const line of data.Lines ?? []) {
    const mapped = KINTETSU_LINE_MAP[line._line_name];
    if (!mapped) continue;
    const text = line.conditions?.[0]?._condition_text ?? "";
    results.push({ name: mapped, status: classifyIssueText(text, text !== "" && !text.includes("平常")) });
  }
  return results;
}

// ---------- 南海電気鉄道（アプリ用の非公式API） ----------
// title は「南海本線 - 南海電鉄」のように末尾に会社名が付くため、" - "の前だけを取り出して完全一致させる。
// 「高野線」は前方一致だと「高野線汐見橋方面」も拾ってしまうため注意。
const NANKAI_TITLE_MAP = { 南海本線: "南海本線", 高野線: "南海高野線" };

async function fetchNankai() {
  const res = await fetch("https://external-data.nankaiapp.com/rss/train_infos.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const results = [];
  for (const n of data.hash_notifications ?? []) {
    const label = (n.title ?? "").split(" - ")[0].trim();
    const mapped = NANKAI_TITLE_MAP[label];
    if (!mapped) continue;
    results.push({ name: mapped, status: classifyIssueText(n.content ?? "", !!n.delay) });
  }
  return results;
}

// ---------- Osaka Metro（e METROアプリ用の非公式API） ----------
// 実際に障害が発生した際のレスポンス例を確認できていないため、
// operationInfoList の中身に各路線名またはrouteCodeを含む要素があるかで
// 簡易判定するベストエフォート実装。想定と異なる形式で来た場合は誤判定の可能性がある。
const OSAKA_METRO_LINES = [
  { code: "1", name: "御堂筋線", mapped: "大阪メトロ御堂筋線" },
  { code: "2", name: "谷町線", mapped: "大阪メトロ谷町線" },
  { code: "3", name: "四つ橋線", mapped: "大阪メトロ四つ橋線" },
  { code: "4", name: "中央線", mapped: "大阪メトロ中央線" },
  { code: "5", name: "千日前線", mapped: "大阪メトロ千日前線" },
  { code: "6", name: "堺筋線", mapped: "大阪メトロ堺筋線" },
  { code: "7", name: "長堀鶴見緑地線", mapped: "大阪メトロ長堀鶴見緑地線" },
  { code: "8", name: "今里筋線", mapped: "大阪メトロ今里筋線" },
  { code: "9", name: "ニュートラム", mapped: "大阪メトロニュートラム" },
];

async function fetchOsakaMetro() {
  const apiKey = process.env.OSAKA_METRO_API_KEY;
  if (!apiKey) throw new Error("環境変数 OSAKA_METRO_API_KEY が未設定");
  const res = await fetch("https://api.mobility-operation-info.emetro-app.osakametro.co.jp/app/api/v1/operationinfo", {
    headers: { "X-Api-Key": apiKey },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data.operationInfoList) ? data.operationInfoList : [];
  return OSAKA_METRO_LINES.map(({ code, name, mapped }) => {
    const relevant = list.filter((item) => {
      const s = JSON.stringify(item);
      return s.includes(name) || s.includes(`"routeCode":"${code}"`);
    });
    const text = relevant.map((x) => JSON.stringify(x)).join(" ");
    return { name: mapped, status: classifyIssueText(text, relevant.length > 0) };
  });
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, "trains"));
  const refByName = new Map();
  snap.forEach((d) => refByName.set(d.data().name, d.ref));

  const fetchers = [
    ["JR西日本", fetchJR],
    ["阪急電鉄", fetchHankyu],
    ["阪神電気鉄道", fetchHanshin],
    ["近畿日本鉄道", fetchKintetsu],
    ["南海電気鉄道", fetchNankai],
    ["Osaka Metro", fetchOsakaMetro],
  ];

  for (const [label, fetcher] of fetchers) {
    let results;
    try {
      results = await fetcher();
    } catch (err) {
      console.error(`${label}の取得に失敗（今回はスキップ）: ${err.message}`);
      continue;
    }
    for (const { name, status } of results) {
      const ref = refByName.get(name);
      if (!ref) {
        console.log(`スキップ（未登録）: ${name}`);
        continue;
      }
      await updateDoc(ref, { status, source: "auto", updatedAt: new Date().toISOString() });
      console.log(`${name}: ${status}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
