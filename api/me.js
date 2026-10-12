const { verifyUser } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const u = await verifyUser(req);
  if (u.error) return res.status(u.status).json({ error: u.error, email: u.email });
  res.status(200).json({ email: u.email, name: u.name, picture: u.picture, isUpdater: u.isUpdater });
};
