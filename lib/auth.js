// Developed by Himanshu Kashyap
// Simple Bearer-token admin auth
// Set ADMIN_PASSWORD in Vercel environment variables

function isAdminAuthorized(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  return token === process.env.ADMIN_PASSWORD && token.length > 0;
}

function requireAdmin(req, res) {
  if (!isAdminAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { isAdminAuthorized, requireAdmin };
