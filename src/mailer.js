const nodemailer = require('nodemailer');

const NOTIFY_TO = 'matt.sacks@invokeinc.com';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('[mailer] SMTP not configured — missing env vars:', { SMTP_HOST: !!SMTP_HOST, SMTP_USER: !!SMTP_USER, SMTP_PASS: !!SMTP_PASS });
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    socketTimeout: 10000,
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

async function sendUsageNotification({ moduleData, filename, fileSize, ip, userAgent }) {
  const t = getTransporter();
  if (!t) return;

  const m = moduleData.metadata;
  const s = moduleData.statistics;
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short' });

  const text = [
    'Module PDF Generator — Usage Notification',
    '==========================================',
    '',
    'Time:        ' + now + ' ET',
    'File:        ' + filename + ' (' + (fileSize / 1024).toFixed(1) + ' KB)',
    'IP Address:  ' + (ip || 'unknown'),
    'User Agent:  ' + (userAgent || 'unknown'),
    '',
    'Module Details',
    '--------------',
    'Name:        ' + m.name,
    'Code:        ' + (m.moduleCode || '—'),
    'Prefix:      ' + (m.prefix || '—'),
    'Category:    ' + (m.category || '—'),
    'Workflow:    ' + (m.workflowFlag ? 'Yes' : 'No'),
    'Version:     ' + (m.version || '—'),
    '',
    'Statistics',
    '----------',
    'Fields:      ' + s.totalFields,
    'Levels:      ' + s.totalLevels,
    'Regions:     ' + s.totalRegions,
    'Rules:       ' + s.totalRules,
    'Roles:       ' + s.totalRoles,
    'WF Stages:   ' + (s.totalWorkflowSegments || 0),
    'WF Tasks:    ' + s.totalWorkflowTasks,
  ].join('\n');

  const html = buildHtml({ m, s, filename, fileSize, ip, userAgent, now });

  console.log('[mailer] Sending notification for module:', m.name);
  try {
    await t.sendMail({
      from: '"Module PDF Generator" <' + process.env.SMTP_USER + '>',
      to: NOTIFY_TO,
      subject: 'New module processed: ' + m.name + (m.prefix ? ' (' + m.prefix + ')' : ''),
      text,
      html,
    });
    console.log('[mailer] Notification sent to', NOTIFY_TO);
  } catch (err) {
    console.error('[mailer] Failed to send notification:', err.message);
  }
}

function buildHtml({ m, s, filename, fileSize, ip, userAgent, now }) {
  return '<div style="font-family:-apple-system,\'Segoe UI\',sans-serif;max-width:560px;margin:0 auto;background:#f8faff;padding:24px;border-radius:12px;">' +
    '<div style="background:linear-gradient(135deg,#0F2447,#1B3A6B);border-radius:8px;padding:20px 24px;margin-bottom:20px;">' +
      '<div style="color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;">Module PDF Generator</div>' +
      '<div style="color:white;font-size:20px;font-weight:800;">Someone Just Generated Docs</div>' +
      '<div style="color:rgba(255,255,255,0.65);font-size:13px;margin-top:4px;">' + esc(now) + ' ET</div>' +
    '</div>' +
    '<div style="background:white;border:1px solid #D1E0F7;border-radius:8px;padding:20px;margin-bottom:16px;">' +
      '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748B;margin-bottom:12px;">Module</div>' +
      '<div style="font-size:22px;font-weight:900;color:#1B3A6B;margin-bottom:6px;">' + esc(m.name) + '</div>' +
      (m.prefix ? '<span style="background:#1B3A6B;color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">' + esc(m.prefix) + '</span>' : '') +
      '<table style="width:100%;margin-top:14px;border-collapse:collapse;font-size:13px;">' +
        row('File', esc(filename) + ' <span style="color:#94A3B8;">(' + (fileSize/1024).toFixed(1) + ' KB)</span>') +
        (m.moduleCode ? row('Module Code', esc(m.moduleCode)) : '') +
        (m.category ? row('Category', esc(m.category)) : '') +
        row('Workflow', m.workflowFlag ? 'Yes' : 'No') +
        (m.version ? row('Version', esc(m.version)) : '') +
      '</table>' +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:16px;"><tr>' +
      stat(s.totalFields, 'Fields') +
      stat(s.totalRules, 'Rules') +
      stat(s.totalRoles, 'Roles') +
      stat(s.totalWorkflowTasks, 'WF Tasks') +
    '</tr></table>' +
    '<div style="background:white;border:1px solid #D1E0F7;border-radius:8px;padding:16px;font-size:12px;color:#475569;">' +
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94A3B8;margin-bottom:8px;">Request Info</div>' +
      '<div><strong>IP:</strong> ' + esc(ip || 'unknown') + '</div>' +
      '<div style="margin-top:4px;word-break:break-all;"><strong>Browser:</strong> ' + esc((userAgent || 'unknown').substring(0, 120)) + '</div>' +
    '</div>' +
  '</div>';
}

function row(label, value) {
  return '<tr>' +
    '<td style="padding:5px 0;color:#94A3B8;font-weight:600;width:110px;vertical-align:top;">' + label + '</td>' +
    '<td style="padding:5px 0;color:#1A202C;">' + value + '</td>' +
  '</tr>';
}

function stat(num, label) {
  return '<td style="padding:4px;"><div style="background:#EBF3FD;border:1px solid #D1E0F7;border-radius:8px;padding:12px;text-align:center;">' +
    '<div style="font-size:22px;font-weight:900;color:#1B3A6B;line-height:1;">' + num + '</div>' +
    '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748B;margin-top:3px;">' + label + '</div>' +
  '</div></td>';
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = { sendUsageNotification };
