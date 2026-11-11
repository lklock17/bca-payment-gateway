const crypto = require('crypto');

function createAuthHelpers({ database, jwtSecret, jwtExpiresHours = 24 }) {
  function generateToken(user, extra = {}) {
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + Math.max(1, Number(jwtExpiresHours) || 24) * 3600;
    const jti = extra.jti || crypto.randomUUID();

    const payload = {
      jti,
      id: user.id,
      email: user.email,
      role: user.role,
      is_primary_admin: Boolean(user.is_primary_admin),
      iat: nowSec,
      exp: expSec
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', jwtSecret).update(encoded).digest('base64url');
    return {
      token: `${encoded}.${signature}`,
      jti,
      expiresAt: new Date(expSec * 1000).toISOString()
    };
  }

  function verifySignature(encoded, signature) {
    if (!encoded || !signature) return false;
    const expectedSignature = crypto.createHmac('sha256', jwtSecret).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token otentikasi diperlukan' });
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 2) {
        return res.status(401).json({ message: 'Token tidak valid' });
      }
      const [encoded, signature] = parts;
      if (!verifySignature(encoded, signature)) {
        return res.status(401).json({ message: 'Token tidak valid atau kedaluwarsa' });
      }

      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      const nowSec = Math.floor(Date.now() / 1000);
      if (payload.exp && nowSec >= payload.exp) {
        return res.status(401).json({ message: 'Sesi telah kedaluwarsa. Silakan login kembali.' });
      }

      const dbUser = await database.get(
        'SELECT id, email, role, is_primary_admin, managed_by_env, is_active FROM users WHERE id = ?',
        [payload.id]
      );
      if (!dbUser) {
        return res.status(401).json({ message: 'Akun tidak ditemukan atau telah dihapus' });
      }
      if (dbUser.is_active === 0) {
        return res.status(401).json({ message: 'Akun Anda telah dinonaktifkan' });
      }

      if (payload.jti) {
        const session = await database.get(
          'SELECT id, revoked_at FROM sessions WHERE token_jti = ? AND user_id = ?',
          [payload.jti, dbUser.id]
        );
        if (session && session.revoked_at) {
          return res.status(401).json({ message: 'Sesi telah dicabut. Silakan login kembali.' });
        }
      }

      req.user = {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        is_primary_admin: Boolean(dbUser.is_primary_admin),
        managed_by_env: Boolean(dbUser.managed_by_env),
        is_active: Boolean(dbUser.is_active),
        jti: payload.jti || null
      };
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Token tidak valid' });
    }
  }

  return {
    generateToken,
    authenticateToken
  };
}

module.exports = {
  createAuthHelpers
};
