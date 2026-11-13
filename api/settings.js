const { verifyUser, callGas } = require('./_lib');

// 공유 설정 저장소. box(직접 입력한 박스 정보)는 누구나, hero(히어로 기준)·rules(등급 기준)는 업데이트 권한자만 저장 가능.
const KINDS = { box: { adminOnly: false }, hero: { adminOnly: true }, rules: { adminOnly: true } };
let cache = null, cacheTs = 0;

// 시트의 줄을 {kind, key, value} 로 되돌림. 예전 저장분은 key 칸에 GAS_KEY(비밀 키)가 적혀 있어서 브라우저로 보내지 않고 버림
function clean(j) {
  const secret = process.env.GAS_KEY || '';
  const items = [];
  ((j && j.items) || []).forEach(it => {
    const i = String(it.kind).indexOf('|');
    if (i > 0) items.push({ ...it, kind: it.kind.slice(0, i), key: it.kind.slice(i + 1) });
    else if (secret && String(it.key) === secret) return;
    else items.push(it);
  });
  return { ...j, items };
}
const TTL = 10 * 1000;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const u = await verifyUser(req);
  if (u.error) return res.status(u.status).json({ error: u.error });
  try {
    if (req.method === 'GET') {
      if (!cache || Date.now() - cacheTs > TTL) { cache = clean(await callGas({ action: 'settings_get' })); cacheTs = Date.now(); }
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
      // callGas 는 인증용 key(= GAS_KEY)를 붙여서 'key' 로 보내는 설정 이름을 덮어씀 → 이름은 kind 안에 같이 넣음 ('box|SB001').
      // Apps Script 를 바꾸지 않아도 항목마다 다른 줄에 저장됨. skey 는 Apps Script 가 나중에 고쳐지면 쓰임 (지금은 무시됨)
      await callGas({ action: del ? 'settings_del' : 'settings_set', kind: kind + '|' + key, skey: key, value, by: u.email });
      cache = null;
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
