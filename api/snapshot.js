const { verifyUser, callGas } = require('./_lib');

// 로그인한 회사 계정에게 "공유 데이터 저장본(gzip)"을 한 번에 내려줍니다.
module.exports = async (req, res) => {
  const u = await verifyUser(req);
  if (u.error) return res.status(u.status).json({ error: u.error });
  try {
    const j = await callGas({ action: 'snapshot' });
    const buf = Buffer.from(j.b64, 'base64');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(buf);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
