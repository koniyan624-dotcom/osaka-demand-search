// JR西日本の非公式運行情報API（train-guide.westjr.co.jp）を10分おきに参照し、
// JR主要路線のみ運行状況を自動でFirestoreに反映する。非公式APIのため、
// JR西日本側の仕様変更で予告なく取得できなくなる可能性がある。
import { initializeApp } from "firebase/app";
import { getDocs, collection, getFirestore, updateDoc } from "firebase/firestore";
import { firebaseConfig } from "../firebase-config.js";

const TRAFFIC_INFO_URL = "https://www.train-guide.westjr.co.jp/api/v3/area_kinki_trafficinfo.json";

// JR西日本APIの路線ID → このアプリの trains コレクションでの路線名
const JR_LINE_MAP = {
  kyoto: "JR京都線",
  kobesanyo: "JR神戸線",
  osakaloop: "JR大阪環状線",
  hanwahagoromo: "JR阪和線",
  osakahigashi: "JRおおさか東線",
  yamatoji: "JR大和路線",
  tozai: "JR東西線",
};

function judgeStatus(info) {
  if (!info) return "normal";
  const text = `${info.status ?? ""}${info.cause ?? ""}`;
  if (text.includes("見合わせ") || text.includes("運休")) return "suspend";
  if (text.includes("遅")) return "delay";
  return "delay";
}

async function main() {
  const res = await fetch(TRAFFIC_INFO_URL);
  if (!res.ok) throw new Error(`trafficinfo取得失敗: HTTP ${res.status}`);
  const data = await res.json();
  const lines = data.lines ?? {};

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, "trains"));
  const refByName = new Map();
  snap.forEach((d) => refByName.set(d.data().name, d.ref));

  for (const [lineId, name] of Object.entries(JR_LINE_MAP)) {
    const ref = refByName.get(name);
    if (!ref) {
      console.log(`スキップ（未登録）: ${name}`);
      continue;
    }
    const status = judgeStatus(lines[lineId]);
    await updateDoc(ref, {
      status,
      source: "auto",
      updatedAt: new Date().toISOString(),
    });
    console.log(`${name}: ${status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
