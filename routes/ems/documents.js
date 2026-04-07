const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');

const docsPath   = path.join(__dirname, '../../data/ems-documents.json');
const auditPath  = path.join(__dirname, '../../data/ems-audit.json');
const uploadDir  = path.join(__dirname, '../../uploads/ems');

const readDocs   = () => JSON.parse(fs.readFileSync(docsPath, 'utf8'));
const writeDocs  = d => fs.writeFileSync(docsPath, JSON.stringify(d, null, 2));
const readAudit  = () => JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const writeAudit = d => fs.writeFileSync(auditPath, JSON.stringify(d, null, 2));

// Ensure upload dir exists
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer config — store with temp name, rename after
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `tmp_${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

function logAudit(action, entityType, entityId, entityName, user, details) {
  const audit = readAudit();
  audit.push({
    id: 'AUD' + uuidv4().split('-')[0].toUpperCase(),
    action, entityType, entityId, entityName,
    userId: user.id, userName: user.name,
    details, timestamp: new Date().toISOString()
  });
  writeAudit(audit);
}

// GET — list documents
router.get('/', requireAuth, (req, res) => {
  let docs = readDocs();
  const { folderId, search, docTypeId, starred, trashed } = req.query;

  if (trashed === 'true') {
    docs = docs.filter(d => d.trashedAt);
  } else {
    docs = docs.filter(d => !d.trashedAt);
  }

  if (folderId) docs = docs.filter(d => d.folderId === folderId);
  if (docTypeId) docs = docs.filter(d => d.docTypeId === docTypeId);
  if (starred === 'true') docs = docs.filter(d => d.starred && d.starred.includes(req.session.user.id));
  if (search) {
    const q = search.toLowerCase();
    docs = docs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  }

  docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ success: true, documents: docs });
});

// GET — recent documents
router.get('/recent', requireAuth, (req, res) => {
  const docs = readDocs()
    .filter(d => !d.trashedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 20);
  res.json({ success: true, documents: docs });
});

// GET — single document
router.get('/:id', requireAuth, (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, document: doc });
});

// POST — create document + upload first version
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const { title, description, folderId, docTypeId, metadata, notes } = req.body;
  if (!title || !folderId || !docTypeId) {
    return res.status(400).json({ success: false, message: 'title, folderId, and docTypeId are required' });
  }

  const docId = 'DOC' + uuidv4().split('-')[0].toUpperCase();
  let parsedMeta = {};
  try { parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {}); } catch (e) { /* ignore */ }

  const doc = {
    id: docId,
    title: title.trim(),
    description: (description || '').trim(),
    folderId,
    docTypeId,
    metadata: parsedMeta,
    status: 'active',
    createdBy: req.session.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: 0,
    versions: [],
    signatures: [],
    watermark: { enabled: false, text: 'CONFIDENTIAL', opacity: 0.15, angle: -30 },
    annotations: [],
    starred: [],
    trashedAt: null,
    lockedBy: null,
    lockedAt: null
  };

  // Handle file if uploaded
  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const storageName = `${docId}_v1${ext}`;
    const storagePath = path.join(uploadDir, storageName);
    fs.renameSync(req.file.path, storagePath);

    doc.currentVersion = 1;
    doc.versions.push({
      version: 1,
      filename: req.file.originalname,
      storagePath: `uploads/ems/${storageName}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.session.user.id,
      uploadedAt: new Date().toISOString(),
      notes: notes || 'Initial upload'
    });
  }

  const docs = readDocs();
  docs.push(doc);
  writeDocs(docs);
  logAudit('document.upload', 'document', doc.id, doc.title, req.session.user, 'Created document' + (req.file ? ' with file upload' : ''));
  res.json({ success: true, document: doc });
});

// POST — upload new version
router.post('/:id/versions', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'File is required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const doc = docs[idx];

  // Check lock
  if (doc.lockedBy && doc.lockedBy !== req.session.user.id) {
    return res.status(423).json({ success: false, message: 'Document is locked by another user' });
  }

  const newVersion = doc.currentVersion + 1;
  const ext = path.extname(req.file.originalname);
  const storageName = `${doc.id}_v${newVersion}${ext}`;
  const storagePath = path.join(uploadDir, storageName);
  fs.renameSync(req.file.path, storagePath);

  doc.versions.push({
    version: newVersion,
    filename: req.file.originalname,
    storagePath: `uploads/ems/${storageName}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.session.user.id,
    uploadedAt: new Date().toISOString(),
    notes: req.body.notes || `Version ${newVersion}`
  });
  doc.currentVersion = newVersion;
  doc.updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.version', 'document', doc.id, doc.title, req.session.user, `Uploaded version ${newVersion}`);
  res.json({ success: true, document: doc });
});

// GET — download specific version
router.get('/:id/versions/:version/download', requireAuth, (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const ver = doc.versions.find(v => v.version === parseInt(req.params.version));
  if (!ver) return res.status(404).json({ success: false, message: 'Version not found' });

  const filePath = path.join(__dirname, '../../', ver.storagePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found on disk' });

  res.download(filePath, ver.filename);
});

// PUT — update document metadata
router.put('/:id', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const allowed = ['title', 'description', 'folderId', 'docTypeId', 'metadata'];
  allowed.forEach(key => { if (req.body[key] !== undefined) docs[idx][key] = req.body[key]; });
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.update', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Updated document metadata');
  res.json({ success: true, document: docs[idx] });
});

// DELETE — soft delete (trash)
router.delete('/:id', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].trashedAt = new Date().toISOString();
  docs[idx].trashedBy = req.session.user.id;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.delete', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Moved to trash');
  res.json({ success: true });
});

// POST — restore from trash
router.post('/:id/restore', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].trashedAt = null;
  docs[idx].trashedBy = null;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.restore', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Restored from trash');
  res.json({ success: true, document: docs[idx] });
});

// DELETE — permanent delete (admin only)
router.delete('/:id/permanent', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

  const docs = readDocs();
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  // Delete physical files
  doc.versions.forEach(v => {
    const filePath = path.join(__dirname, '../../', v.storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  const remaining = docs.filter(d => d.id !== req.params.id);
  writeDocs(remaining);
  logAudit('document.permanent_delete', 'document', doc.id, doc.title, req.session.user, 'Permanently deleted');
  res.json({ success: true });
});

// POST — apply signature
router.post('/:id/sign', requireAuth, (req, res) => {
  const { signatureId } = req.body;
  if (!signatureId) return res.status(400).json({ success: false, message: 'signatureId is required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].signatures.push({
    signatureId,
    userId: req.session.user.id,
    userName: req.session.user.name,
    signedAt: new Date().toISOString(),
    type: 'drawn'
  });
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.sign', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Applied signature');
  res.json({ success: true, document: docs[idx] });
});

// PUT — watermark config
router.put('/:id/watermark', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const { enabled, text, opacity, angle } = req.body;
  if (enabled !== undefined) docs[idx].watermark.enabled = enabled;
  if (text !== undefined) docs[idx].watermark.text = text;
  if (opacity !== undefined) docs[idx].watermark.opacity = opacity;
  if (angle !== undefined) docs[idx].watermark.angle = angle;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  res.json({ success: true, document: docs[idx] });
});

// POST — save annotation
router.post('/:id/annotations', requireAuth, (req, res) => {
  const { page, data, type } = req.body;
  if (data === undefined || page === undefined) return res.status(400).json({ success: false, message: 'page and data are required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].annotations.push({
    id: 'ANN' + uuidv4().split('-')[0].toUpperCase(),
    userId: req.session.user.id,
    type: type || 'drawing',
    page,
    data,
    createdAt: new Date().toISOString()
  });
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  res.json({ success: true, document: docs[idx] });
});

// POST — toggle star
router.post('/:id/star', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const userId = req.session.user.id;
  const starIdx = docs[idx].starred.indexOf(userId);
  if (starIdx === -1) {
    docs[idx].starred.push(userId);
  } else {
    docs[idx].starred.splice(starIdx, 1);
  }

  writeDocs(docs);
  res.json({ success: true, starred: starIdx === -1, document: docs[idx] });
});

// POST — lock document
router.post('/:id/lock', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  if (docs[idx].lockedBy && docs[idx].lockedBy !== req.session.user.id) {
    return res.status(423).json({ success: false, message: 'Document is already locked by another user' });
  }

  docs[idx].lockedBy = req.session.user.id;
  docs[idx].lockedAt = new Date().toISOString();
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.lock', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Locked document');
  res.json({ success: true, document: docs[idx] });
});

// POST — unlock document
router.post('/:id/unlock', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  if (docs[idx].lockedBy && docs[idx].lockedBy !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only the locker or admin can unlock' });
  }

  docs[idx].lockedBy = null;
  docs[idx].lockedAt = null;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.unlock', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Unlocked document');
  res.json({ success: true, document: docs[idx] });
});

// POST — move to different folder
router.post('/:id/move', requireAuth, (req, res) => {
  const { folderId } = req.body;
  if (!folderId) return res.status(400).json({ success: false, message: 'folderId is required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].folderId = folderId;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.move', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Moved document');
  res.json({ success: true, document: docs[idx] });
});

// POST — bulk move
router.post('/bulk/move', requireAuth, (req, res) => {
  const { documentIds, folderId } = req.body;
  if (!documentIds || !folderId) return res.status(400).json({ success: false, message: 'documentIds and folderId are required' });

  const docs = readDocs();
  let moved = 0;
  documentIds.forEach(id => {
    const idx = docs.findIndex(d => d.id === id);
    if (idx !== -1) { docs[idx].folderId = folderId; docs[idx].updatedAt = new Date().toISOString(); moved++; }
  });

  writeDocs(docs);
  logAudit('document.bulk_move', 'document', '', '', req.session.user, `Bulk moved ${moved} documents`);
  res.json({ success: true, moved });
});

// POST — bulk delete (soft)
router.post('/bulk/delete', requireAuth, (req, res) => {
  const { documentIds } = req.body;
  if (!documentIds) return res.status(400).json({ success: false, message: 'documentIds is required' });

  const docs = readDocs();
  let deleted = 0;
  const now = new Date().toISOString();
  documentIds.forEach(id => {
    const idx = docs.findIndex(d => d.id === id);
    if (idx !== -1) { docs[idx].trashedAt = now; docs[idx].trashedBy = req.session.user.id; docs[idx].updatedAt = now; deleted++; }
  });

  writeDocs(docs);
  logAudit('document.bulk_delete', 'document', '', '', req.session.user, `Bulk trashed ${deleted} documents`);
  res.json({ success: true, deleted });
});

module.exports = router;
