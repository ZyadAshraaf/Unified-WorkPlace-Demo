const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');

const invPath      = path.join(__dirname, '../data/invoices.json');
const tasksPath    = path.join(__dirname, '../data/tasks.json');
const usersPath    = path.join(__dirname, '../data/users.json');
const emsDocsPath  = path.join(__dirname, '../data/ems-documents.json');
const emsAuditPath = path.join(__dirname, '../data/ems-audit.json');
const uploadDir    = path.join(__dirname, '../uploads/ems');

const readInv    = () => JSON.parse(fs.readFileSync(invPath,   'utf8'));
const readTasks  = () => JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const readUsers  = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const writeInv   = d  => fs.writeFileSync(invPath,   JSON.stringify(d, null, 2));
const writeTasks = d  => fs.writeFileSync(tasksPath, JSON.stringify(d, null, 2));

// CMS filing target: Root › Finance › Invoices, doc type "Invoice"
const INVOICES_FOLDER_ID = 'FLD1A2B3C02';
const INVOICE_DOCTYPE_ID = 'DT001';

// Multer — the submitted invoice PDF is also archived into the CMS uploads dir
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `tmp_${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Form fields arrive as JSON strings under multipart, or native arrays under JSON
const asArray = v => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch { return []; } }
  return [];
};

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

// File the submitted invoice PDF into the CMS Invoices folder as an active document.
// Returns { docId, title } on success, or null if there was no file to archive.
function fileInvoiceInCms(req, inv) {
  if (!req.file) return null;

  const docs  = JSON.parse(fs.readFileSync(emsDocsPath, 'utf8'));
  const docId = 'DOC' + uuidv4().split('-')[0].toUpperCase();
  const ext   = path.extname(req.file.originalname);
  const storageName = `${docId}_v1${ext}`;
  fs.renameSync(req.file.path, path.join(uploadDir, storageName));

  const nowIso = new Date().toISOString();
  const title  = `Invoice ${inv.invoiceNumber} — ${inv.poNumberExtracted || inv.poNumber || 'Unmatched PO'}`;

  const doc = {
    id:          docId,
    title,
    description: `Vendor invoice submitted via Invoice Validator. Vendor: ${inv.vendorEmail || '—'}. AI verdict: ${inv.outcomeLabel}.`,
    folderId:    INVOICES_FOLDER_ID,
    docTypeId:   INVOICE_DOCTYPE_ID,
    metadata: {
      vendorEmail:    inv.vendorEmail,
      poNumber:       inv.poNumberExtracted || inv.poNumber,
      aiVerdict:      inv.outcomeLabel,
      approvalNumber: inv.approvalNumber,
      invoiceId:      inv.id
    },
    status:         'active',
    createdBy:      req.session.user.id,
    createdAt:      nowIso,
    updatedAt:      nowIso,
    currentVersion: 1,
    versions: [{
      version:     1,
      filename:    req.file.originalname,
      storagePath: `uploads/ems/${storageName}`,
      mimeType:    req.file.mimetype,
      size:        req.file.size,
      uploadedBy:  req.session.user.id,
      uploadedAt:  nowIso,
      notes:       'Filed automatically from Invoice Validator'
    }],
    signatures: [],
    watermark:  { enabled: false, text: 'CONFIDENTIAL', opacity: 0.15, angle: -30 },
    annotations: [],
    starred:    [],
    trashedAt:  null,
    lockedBy:   null,
    lockedAt:   null
  };
  docs.push(doc);
  fs.writeFileSync(emsDocsPath, JSON.stringify(docs, null, 2));

  try {
    const audit = JSON.parse(fs.readFileSync(emsAuditPath, 'utf8'));
    audit.push({
      id: 'AUD' + uuidv4().split('-')[0].toUpperCase(),
      action: 'document.upload', entityType: 'document', entityId: docId, entityName: title,
      userId: req.session.user.id, userName: req.session.user.name,
      details: 'Filed from Invoice Validator', timestamp: nowIso
    });
    fs.writeFileSync(emsAuditPath, JSON.stringify(audit, null, 2));
  } catch (e) { /* audit is best-effort */ }

  return { docId, title };
}

// Human-readable label for the outcome returned by the validator API
const OUTCOME_LABEL = {
  full_match:       'Fully Validated',
  partial_match:    'Partially Validated',
  partial_rejected: 'Partially Rejected',
  wrong_currency:   'Currency Mismatch',
  full_rejected:    'Fully Rejected',
  wrong_po:         'Purchase Order Not Found'
};

// GET /api/invoices — role-filtered list
router.get('/', requireAuth, (req, res) => {
  const user  = req.session.user;
  let   invs  = readInv();
  const users = readUsers();
  const uMap  = {};
  users.forEach(u => uMap[u.id] = u.name);

  if (user.role === 'employee') {
    invs = invs.filter(i => i.userId === user.id);
  }

  invs = invs.map(i => ({
    ...i,
    userName:     uMap[i.userId]     || 'Unknown',
    reviewerName: uMap[i.reviewedBy] || null
  }));

  res.json({ success: true, invoices: invs });
});

// GET /api/invoices/:id
router.get('/:id', requireAuth, (req, res) => {
  const user  = req.session.user;
  const invs  = readInv();
  const users = readUsers();
  const uMap  = {};
  users.forEach(u => uMap[u.id] = u.name);

  const inv = invs.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ success: false, message: 'Invoice not found' });

  res.json({ success: true, invoice: { ...inv, userName: uMap[inv.userId] || 'Unknown', reviewerName: uMap[inv.reviewedBy] || null } });
});

// POST /api/invoices — persist a validated invoice, archive the PDF to CMS, raise an approval task
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const user  = req.session.user;
  const invs  = readInv();
  const tasks = readTasks();
  const users = readUsers();

  const employee  = users.find(u => u.id === user.id);
  const managerId = employee ? employee.managerId : null;

  const outcome         = req.body.outcome || 'full_match';
  const headerFields    = asArray(req.body.headerFields);
  const lineItemResults = asArray(req.body.lineItemResults);

  const totalLines    = lineItemResults.length;
  const approvedCount = lineItemResults.filter(l => l.status === 'approved').length;
  const rejectedCount = lineItemResults.filter(l => l.status === 'rejected').length;
  const hasIssues     = rejectedCount > 0 || outcome === 'wrong_currency';

  const invNumber = `INV-${new Date().getFullYear()}-${String(invs.length + 1).padStart(4, '0')}`;
  const invId     = 'INV' + uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();

  const inv = {
    id:                invId,
    invoiceNumber:     invNumber,
    userId:            user.id,
    vendorEmail:       req.body.vendorEmail       || '',
    poNumber:          req.body.poNumber          || '',      // the PO the user associated in the form
    poNumberExtracted: req.body.poNumberExtracted || '',      // the PO the AI read off the invoice
    fileName:          req.body.fileName          || 'invoice.pdf',
    outcome,
    outcomeLabel:      OUTCOME_LABEL[outcome] || outcome,
    approvalNumber:    req.body.approvalNumber    || '',
    reason:            req.body.reason            || '',       // justification when submitted with issues
    poNotFoundMessage: req.body.poNotFoundMessage || '',
    headerFields,
    lineItemResults,
    totalLines,
    approvedCount,
    rejectedCount,
    status:            'pending',
    taskId:            null,
    emsDocId:          null,
    emsDocTitle:       null,
    submittedAt:       new Date().toISOString(),
    reviewedBy:        null,
    reviewedAt:        null,
    reviewNote:        ''
  };

  // Archive the submitted PDF into the CMS Invoices folder (owned by the submitter)
  const cms = fileInvoiceInCms(req, inv);
  if (cms) {
    inv.emsDocId    = cms.docId;
    inv.emsDocTitle = cms.title;
  }

  if (managerId) {
    const summary = totalLines
      ? `${approvedCount}/${totalLines} line item(s) validated${rejectedCount ? `, ${rejectedCount} rejected` : ''}.`
      : '';
    const task = {
      id:           'T' + uuidv4().split('-')[0].toUpperCase(),
      title:        `Approve Invoice — ${inv.poNumberExtracted || invNumber}`,
      description:  `${user.name} submitted an invoice for ${inv.vendorEmail || 'a vendor'} against PO ${inv.poNumberExtracted || inv.poNumber || '—'}. AI validation: ${inv.outcomeLabel}. ${summary}`.trim(),
      sourceSystem: 'Accounting',
      type:         'approval',
      priority:     hasIssues ? 'high' : 'medium',
      status:       'pending',
      assignedTo:   managerId,
      createdBy:    user.id,
      dueDate:      null,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { invoiceId: invId },
      history:      [{ action: 'created', by: user.id, at: new Date().toISOString(), note: 'Invoice submitted for approval' }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    };
    inv.taskId = task.id;
    tasks.push(task);
    writeTasks(tasks);
  }

  invs.push(inv);
  writeInv(invs);
  res.json({ success: true, invoice: inv });
});

// PUT /api/invoices/:id/approve
router.put('/:id/approve', requireAuth, (req, res) => {
  const user  = req.session.user;
  const invs  = readInv();
  const tasks = readTasks();

  const idx = invs.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Invoice not found' });

  invs[idx].status     = 'approved';
  invs[idx].reviewedBy = user.id;
  invs[idx].reviewedAt = new Date().toISOString();
  invs[idx].reviewNote = req.body.note || '';

  if (invs[idx].taskId) {
    const tIdx = tasks.findIndex(t => t.id === invs[idx].taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = 'approved';
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({ action: 'approved', by: user.id, at: new Date().toISOString(), note: req.body.note || 'Invoice approved' });
      writeTasks(tasks);
    }
  }

  writeInv(invs);
  res.json({ success: true, invoice: invs[idx] });
});

// PUT /api/invoices/:id/reject
router.put('/:id/reject', requireAuth, (req, res) => {
  const user  = req.session.user;
  const invs  = readInv();
  const tasks = readTasks();

  const idx = invs.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Invoice not found' });

  invs[idx].status     = 'rejected';
  invs[idx].reviewedBy = user.id;
  invs[idx].reviewedAt = new Date().toISOString();
  invs[idx].reviewNote = req.body.note || '';

  if (invs[idx].taskId) {
    const tIdx = tasks.findIndex(t => t.id === invs[idx].taskId);
    if (tIdx !== -1) {
      tasks[tIdx].status    = 'rejected';
      tasks[tIdx].updatedAt = new Date().toISOString();
      tasks[tIdx].history.push({ action: 'rejected', by: user.id, at: new Date().toISOString(), note: req.body.note || 'Invoice rejected' });
      writeTasks(tasks);
    }
  }

  writeInv(invs);
  res.json({ success: true, invoice: invs[idx] });
});

module.exports = router;
