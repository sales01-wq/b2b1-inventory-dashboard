// 공통 도우미: 구글 로그인 토큰 검증 + 권한 확인 + Apps Script 호출
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ALLOWED_DOMAIN = (process.env.ALLOWED_DOMAIN || '').toLowerCase().replace(/^@/, '');
const UPDATERS = (process.env.UPDATER_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function verifyUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return { error: 'no token', status: 401 };
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
    if (!r.ok) return { error: 'invalid token', status: 401 };
    info = await r.json();
  } catch (e) {
    return { error: 'token verify failed', status: 401 };
  }
  if (!CLIENT_ID || info.aud !== CLIENT_ID) return { error: 'bad audience', status: 401 };
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) return { error: 'bad issuer', status: 401 };
  if (info.email_verified !== 'true' && info.email_verified !== true) return { error: 'email not verified', status: 401 };
  if (Number(info.exp) * 1000 < Date.now()) return { error: 'expired', status: 401 };
  const email = String(info.email || '').toLowerCase();
  const domainOk = ALLOWED_DOMAIN && email.endsWith('@' + ALLOWED_DOMAIN) && String(info.hd || '').toLowerCase() === ALLOWED_DOMAIN;
  if (!domainOk) return { error: 'domain not allowed', status: 403, email };
  return { email, name: info.name || email, picture: info.picture || '', isUpdater: UPDATERS.includes(email) };
}

async function callGas(params) {
  const url = process.env.GAS_URL;
  const key = process.env.GAS_KEY;
  if (!url || !key) throw new Error('GAS_URL / GAS_KEY 환경변수가 설정되지 않았습니다.');
  const qs = new URLSearchParams({ ...params, key }).toString();
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + qs, { redirect: 'follow' });
  if (!r.ok) throw new Error('Apps Script 호출 실패 (' + r.status + ')');
  const j = await r.json();
  if (j && j.error) throw new Error('Apps Script: ' + j.error);
  return j;
}

module.exports = { verifyUser, callGas, CLIENT_ID };
