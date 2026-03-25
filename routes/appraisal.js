const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const appraisalsPath = path.join(__dirname, '../data/appraisals.json');
const usersPath      = path.join(__dirname, '../data/users.json');

const read      = () => JSON.parse(fs.readFileSync(appraisalsPath, 'utf8'));
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const write     = d  => fs.writeFileSync(appraisalsPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

router.get('/', requireAuth, (req, res) => {
  const user       = req.session.user;
  let appraisals   = read();
  const users      = readUsers();
  const userMap    = {};
  users.forEach(u => userMap[u.id] = u.name);

  if (user.role === 'employee') {
    appraisals = appraisals.filter(a => a.userId === user.id);
  }

  appraisals = appraisals.map(a => ({
    ...a,
    userName:     userMap[a.userId]     || 'Unknown',
    reviewerName: userMap[a.reviewedBy] || 'Unknown'
  }));

  res.json({ success: true, appraisals });
});

router.put('/:id', requireAuth, (req, res) => {
  const user       = req.session.user;
  const appraisals = read();
  const idx        = appraisals.findIndex(a => a.id === req.params.id);

  if (idx === -1) return res.status(404).json({ success: false, message: 'Appraisal not found' });

  const a = appraisals[idx];

  if (req.body.selfAssessment) {
    a.selfAssessment = req.body.selfAssessment;
    a.status         = 'manager-review';
    a.submittedAt    = new Date().toISOString();
    req.body.selfAssessment.score && a.categories.forEach(c => {
      if (req.body.categories) {
        const match = req.body.categories.find(rc => rc.name === c.name);
        if (match) c.selfScore = match.selfScore;
      }
    });
  }

  if (req.body.managerAssessment) {
    a.managerAssessment = req.body.managerAssessment;
    a.status            = 'completed';
    a.completedAt       = new Date().toISOString();
    const scores        = [a.selfAssessment?.score || 0, req.body.managerAssessment.score || 0];
    a.overallScore      = +(scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1);
  }

  write(appraisals);
  res.json({ success: true, appraisal: a });
});

module.exports = router;
