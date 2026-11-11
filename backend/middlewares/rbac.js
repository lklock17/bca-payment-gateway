function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (req.user && allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({
      message: 'Akses ditolak: Memerlukan hak akses Admin'
    });
  };
}

function requireAdmin(req, res, next) {
  return requireRole(['admin'])(req, res, next);
}

function createUserMgmtWritableMiddleware(getEnvConfigFn) {
  return (req, res, next) => {
    const envConfig = getEnvConfigFn();
    if (envConfig.user_management_mode === 'env_only') {
      return res.status(403).json({
        message: 'Manajemen user dikunci pada mode env_only. Tambah, edit, atau hapus user hanya dapat dilakukan melalui file .env server.'
      });
    }
    return next();
  };
}

module.exports = {
  requireRole,
  requireAdmin,
  createUserMgmtWritableMiddleware
};
