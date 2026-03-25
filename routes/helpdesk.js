const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const helpdeskPath = path.join(__dirname, '../data/helpdesk.json');
const usersPath    = path.join(__dirname, '../data/users.json');

const read      = () => JSON.parse(fs.readFileSync(helpdeskPath, 'utf8'));
const readUsers = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const write     = d  => fs.writeFileSync(helpdeskPath, JSON.stringify(d, null, 2));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

router.get('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  let tickets   = read();
  const users   = readUsers();
  const userMap = {};
  users.forEach(u => userMap[u.id] = u.name);

  if (user.role === 'employee') {
    tickets = tickets.filter(t => t.submittedBy === user.id);
  }

  tickets = tickets.map(t => ({
    ...t,
    submittedByName: userMap[t.submittedBy] || 'Unknown',
    assignedToName:  userMap[t.assignedTo]  || 'Unassigned'
  }));

  res.json({ success: true, tickets });
});

router.post('/', requireAuth, (req, res) => {
  const user    = req.session.user;
  const tickets = read();
  const all     = tickets;
  const nextNum = all.length + 1;

  const ticket = {
    id:          'HD' + uuidv4().split('-')[0].toUpperCase(),
    ticketNo:    `TKT-2026-${String(nextNum).padStart(3, '0')}`,
    title:       req.body.title,
    description: req.body.description || '',
    category:    req.body.category    || 'General',
    priority:    req.body.priority    || 'medium',
    status:      'open',
    submittedBy: user.id,
    assignedTo:  null,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    comments:    []
  };

  tickets.push(ticket);
  write(tickets);
  res.json({ success: true, ticket });
});

router.put('/:id', requireAuth, (req, res) => {
  const user    = req.session.user;
  const tickets = read();
  const idx     = tickets.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Ticket not found' });

  const t = tickets[idx];
  ['status', 'priority', 'assignedTo'].forEach(f => {
    if (req.body[f] !== undefined) t[f] = req.body[f];
  });

  if (req.body.comment) {
    t.comments.push({
      by:         user.id,
      name:       user.name,
      at:         new Date().toISOString(),
      text:       req.body.comment,
      isInternal: req.body.isInternal || false
    });
  }

  t.updatedAt = new Date().toISOString();
  write(tickets);
  res.json({ success: true, ticket: t });
});

module.exports = router;
