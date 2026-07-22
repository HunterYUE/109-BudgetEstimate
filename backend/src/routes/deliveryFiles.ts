import { Router } from 'express';
import { query } from '../db/index.js';
import { AppError } from '../middleware/index.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'delivery');
const MAX_SIZE = 3 * 1024 * 1024; // 3MB

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[/\\:]/g, '_');
    cb(null, unique + '-' + safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, '仅支持 PDF 文件'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

// 列出项目附件
router.get('/:deliveryId/files', async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const files = await query(
      'SELECT id, file_type, file_name, file_size, created_at FROM delivery_files WHERE delivery_project_id = $1 ORDER BY created_at',
      [deliveryId]
    );
    res.json(files.rows);
  } catch (err) { next(err); }
});

// 上传附件
router.post('/:deliveryId/files', upload.single('file'), async (req, res, next) => {
  try {
    const { deliveryId } = req.params;
    const { file_type } = req.body;
    const rf = req as any;
    if (!rf.file) throw new AppError(400, '请选择文件');
    if (!file_type) throw new AppError(400, '缺少 file_type');

    const result = await query(
      `INSERT INTO delivery_files (delivery_project_id, file_type, file_name, file_size, file_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, file_type, file_name, file_size, created_at`,
      [deliveryId, file_type, Buffer.from(rf.file.originalname, 'latin1').toString('utf8'), rf.file.size, rf.file.path]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// 下载/查看附件
router.get('/:deliveryId/files/:fileId/download', async (req, res, next) => {
  try {
    const { deliveryId, fileId } = req.params;
    const file = (await query(
      'SELECT * FROM delivery_files WHERE id = $1 AND delivery_project_id = $2',
      [fileId, deliveryId]
    )).rows[0];
    if (!file) throw new AppError(404, '文件未找到');
    if (!fs.existsSync(file.file_path)) throw new AppError(404, '文件已丢失');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`);
    const stream = fs.createReadStream(file.file_path);
    stream.on('error', (e) => { res.removeHeader('Content-Disposition'); res.status(500).json({ error: '文件读取失败' }); });
    stream.pipe(res);
  } catch (err) { next(err); }
});

// 删除附件
router.delete('/:deliveryId/files/:fileId', async (req, res, next) => {
  try {
    const { deliveryId, fileId } = req.params;
    const file = (await query(
      'SELECT * FROM delivery_files WHERE id = $1 AND delivery_project_id = $2',
      [fileId, deliveryId]
    )).rows[0];
    if (!file) throw new AppError(404, '文件未找到');

    // 删除物理文件
    try { if (fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path); } catch {}
    // 删除数据库记录
    await query('DELETE FROM delivery_files WHERE id = $1', [fileId]);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
