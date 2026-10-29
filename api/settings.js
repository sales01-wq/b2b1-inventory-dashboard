const { verifyUser, callGas } = require('./_lib');

// 공유 설정 저장소. box(직접 입력한 박스 정보)는 누구나, hero(히어로 기준)·rules(등급 기준)는 업데이트 권한자만 저장 가능.
const KINDS = { box: { adminOnly: false }, hero: { adminOnly: true }, rules: { adminOnly: true } };
let cache = null, cacheTs = 0;
const TTL = 10 * 1000;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const u = await verifyUser(req);
  if (u.error) return res.status(u.status).json({ error: u.error });
  try {
    if (req.method === 'GET') {
      if (!cache || Date.now() - cacheTs > TTL) { cache = await callGas({ action: 'settings_get' }); cacheTs = Date.now(); }
      return res.status(200).json(cache);
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      const kind = String(b.kind || ''), key = String(b.key || '');
      if (!KINDS[kind]) return res.status(400).json({ error: 'bad kind' });
      if (!key || key.length > 100) return res.status(400).json({ error: 'bad key' });
      if (KINDS[kind].adminOnly && !u.isUpdater) return res.status(403).json({ error: '업데이트 권한자만 바꿀 수 있습니다.' });
      const del = b.value === null || b.value === undefined;
      const value = del ? '' : JSON.stringify(b.value);
      if (value.length > 4000) return res.status(400).json({ error: 'value too large' });
      await callGas({ action: del ? 'settings_del' : 'settings_set', kind, key, value, by: u.email });
      cache = null;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
