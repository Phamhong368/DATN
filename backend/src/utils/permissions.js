export function requireAdmin(req, res) {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ message: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này.' });
    return false;
  }
  return true;
}

