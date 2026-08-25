/* 동행복권 공식 회차별 페이지에서 로또 6/45 당첨번호를 저장합니다. */
const fs = require('fs');
const https = require('https');
const API = round => `https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=${round}&_=${Date.now()}`;
const PRINT = (start, end) => `https://www.dhlottery.co.kr/gameResult.do?drwNoEnd=${end}&drwNoStart=${start}&gubun=byWin&method=allWinPrint`;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {headers:{'User-Agent':'Mozilla/5.0 pick-and-balance/1.0','Accept':'application/json,text/html'}}, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk);
      response.on('end', () => resolve({status:response.statusCode, type:response.headers['content-type'] || '', body}));
    }).on('error', reject);
  });
}

function parseOfficialJson(body) {
  if (!body.trim().startsWith('{')) return null;
  const data = JSON.parse(body);
  if (data.returnValue !== 'success') return null;
  return {round:data.drwNo, date:data.drwNoDate, numbers:[data.drwtNo1,data.drwtNo2,data.drwtNo3,data.drwtNo4,data.drwtNo5,data.drwtNo6], bonus:data.bnusNo};
}

function parseNewOfficialJson(body) {
  if (!body.trim().startsWith('{')) return null;
  const payload = JSON.parse(body);
  const data = payload?.data?.list?.[0];
  if (!data || !data.ltEpsd) return null;
  return normalizeNewItem(data);
}

function normalizeNewItem(data) {
  return {round:Number(data.ltEpsd), date:String(data.ltRflYmd || ''), numbers:[data.tm1WnNo,data.tm2WnNo,data.tm3WnNo,data.tm4WnNo,data.tm5WnNo,data.tm6WnNo].map(Number), bonus:Number(data.bnsWnNo)};
}

function parseNewOfficialRows(body) {
  if (!body.trim().startsWith('{')) return [];
  const payload = JSON.parse(body);
  return (payload?.data?.list || []).filter(item => item.ltEpsd).map(normalizeNewItem);
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');
}

function parseOfficialPrint(html) {
  const rows = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const text = stripHtml(row);
    if (!/1등/.test(text)) continue;
    const match = text.match(/(\d{1,4})회\s+([1-9]|[1-3]\d|4[0-5])\s+([1-9]|[1-3]\d|4[0-5])\s+([1-9]|[1-3]\d|4[0-5])\s+([1-9]|[1-3]\d|4[0-5])\s+([1-9]|[1-3]\d|4[0-5])\s+([1-9]|[1-3]\d|4[0-5])\s+([1-9]|[1-3]\d|4[0-5])/);
    if (match) rows.push({round:Number(match[1]), date:'', numbers:match.slice(2,8).map(Number), bonus:Number(match[8])});
  }
  return rows;
}

async function main() {
  const saved = fs.existsSync('lotto-history.json') ? JSON.parse(fs.readFileSync('lotto-history.json','utf8')) : [];
  const known = new Map(saved.map(item => [item.round, item]));
  let usedApi = 0;
  try {
    const allResponse = await get(`https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd=all&_=${Date.now()}`);
    const allRows = parseNewOfficialRows(allResponse.body);
    allRows.forEach(item => known.set(item.round, item));
    if (allRows.length) console.log(`공식 전체 목록 ${allRows.length}회 수신`);
  } catch {}
  if (known.size < 100) for (let round = 1; round <= 3000; round++) {
    try {
      const response = await get(API(round));
      const item = parseNewOfficialJson(response.body) || parseOfficialJson(response.body);
      if (item) { known.set(item.round, item); usedApi++; process.stdout.write(`\r공식 API ${item.round}회 수집`); }
      else if (response.body.trim().startsWith('<')) break;
    } catch { break; }
  }
  if (!usedApi || known.size < 100) {
    console.log('\nJSON API가 HTML 차단 페이지를 반환해 회차별 공식 출력 페이지로 전환합니다.');
    for (let start = 1; start <= 3000; start += 100) {
      const end = Math.min(start + 99, 3000), response = await get(PRINT(start, end));
      const rows = parseOfficialPrint(response.body); rows.forEach(item => known.set(item.round, item));
      if (rows.length) process.stdout.write(`\r공식 출력 페이지 ${start}~${end}회 수집 (${known.size}회)`);
      if (!rows.length && start > 100) break;
    }
  }
  if (!known.size) throw new Error('동행복권이 HTML 차단 페이지를 반환했습니다. 잠시 후 재시도하거나 공식 사이트 접근이 가능한 네트워크에서 실행하세요.');
  const result = [...known.values()].sort((a,b) => a.round - b.round);
  fs.writeFileSync('lotto-history.json', JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n공식 데이터 ${result.length}회 저장 완료: lotto-history.json`);
}
main().catch(error => { console.error(`\n다운로드 실패: ${error.message || error.code || String(error)}`); process.exitCode = 1; });
