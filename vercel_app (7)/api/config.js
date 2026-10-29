// 로그인 전에도 호출 가능: 구글 로그인 버튼에 필요한 클라이언트 ID만 알려줍니다.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ clientId: process.env.GOOGLE_CLIENT_ID || '', domain: process.env.ALLOWED_DOMAIN || '' });
};
