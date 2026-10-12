const { verifyUser, callGas } = require('./_lib');

// 로그인한 회사 계정만 사용 가능. action: meta | rows | progress | update(업데이트 권한자만)
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const u = await verifyUser(req);
  if (u.error) return res.status(u.status).json({ error: u.error });
  const q = req.query || {};
  try {
    switch (q.action) {
      case 'meta':
        return res.status(200).json(await callGas({ action: 'meta' }));
      case 'progress':
        return res.status(200).json(await callGas({ action: 'progress' }));
      case 'rows': {
        const from = Math.max(0, parseInt(q.from || '0', 10) || 0);
        const count = Math.max(1, Math.min(2000, parseInt(q.count || '1000', 10) || 1000));
        return res.status(200).json(await callGas({ action: 'rows', sheet: String(q.sheet || ''), from, count }));
      }
      case 'update':
        if (!u.isUpdater) return res.status(403).json({ error: '업데이트 권한이 없습니다.' });
        return res.status(200).json(await callGas({ action: 'start', by: u.email }));
      default:
        return res.status(400).json({ error: 'unknown action' });
    }
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
