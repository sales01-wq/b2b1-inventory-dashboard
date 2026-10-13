const { verifyUser, callGas } = require('./_lib');

// 로그인한 회사 계정에게 "공유 데이터 저장본(gzip)"을 내려줍니다.
// - 구글 서버 호출은 1번(bundle). 같은 서버 인스턴스가 살아있는 동안은 메모리에 보관해서 더 빠르게 응답합니다.
// - 요청의 have 가 현재 저장본 버전과 같으면 본문 없이 204 (이미 최신).
// - fresh=1 이면 메모리 보관분을 건너뛰고 구글에 최신 여부를 다시 물어봅니다 (업데이트 직후 등).
let cache = null; // {at, buf, meta, ts}
const FRESH_MS = 60 * 1000;

async function refreshCache() {
  const j = await callGas({ action: 'bundle', have: cache ? String(cache.at) : '' });
  if (j.none) { cache = null; return false; }
  const meta = { snapshot: j.snapshot, lastUpdate: j.lastUpdate };
  if (j.unchanged && cache) { cache.ts = Date.now(); cache.meta = meta; return true; }
  if (j.b64) { cache = { at: j.snapshot.at, buf: Buffer.from(j.b64, 'base64'), meta, ts: Date.now() }; return true; }
  cache = null; return false;
}

module.exports = async (req, res) => {
  const u = await verifyUser(req);
  if (u.error) return res.status(u.status).json({ error: u.error });
  const q = req.query || {};
  try {
    const stale = !cache || q.fresh === '1' || (Date.now() - cache.ts) > FRESH_MS;
    if (stale) {
      const ok = await refreshCache();
      if (!ok) return res.status(409).json({ error: 'no snapshot' });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Meta', encodeURIComponent(JSON.stringify(cache.meta)));
    res.setHeader('Access-Control-Expose-Headers', 'X-Meta');
    if (String(q.have || '') === String(cache.at)) return res.status(204).end();
    res.setHeader('Content-Type', 'application/octet-stream');
    res.status(200).send(cache.buf);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
