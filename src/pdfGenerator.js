const puppeteer = require('puppeteer');

const THEME = {
  navy: '#1B3A6B',
  navyDark: '#0F2447',
  blue: '#0073E6',
  blueLight: '#EBF3FD',
  blueMid: '#CCDFF7',
  text: '#1A202C',
  textMuted: '#64748B',
  border: '#D1E0F7',
  rowAlt: '#F8FAFF',
  white: '#FFFFFF',
  green: '#059669',
  greenLight: '#D1FAE5',
  yellow: '#D97706',
  yellowLight: '#FEF3C7',
  red: '#DC2626',
  redLight: '#FEE2E2',
  codeBg: '#1E293B',
  codeText: '#93C5FD',
};

const DOC_TYPES = [
  { id: 'overview',         title: 'Module Overview',      description: 'Module summary, properties, and key statistics' },
  { id: 'data-dictionary',  title: 'Data Dictionary',       description: 'Complete field reference with types and properties' },
  { id: 'workflow',         title: 'Workflow Guide',         description: 'Tasks, assignments, and process flows' },
  { id: 'rules',            title: 'Rules & Behaviors',     description: 'DXL rules and field behavior configurations' },
  { id: 'layout',           title: 'Layout Reference',      description: 'Screen regions and field placement' },
  { id: 'security',         title: 'Security Reference',    description: 'Roles, permissions, and access control' },
  { id: 'test-scripts',     title: 'Test Scripts',          description: 'UAT test cases for workflow, roles, rules, and field validation' },
];

async function generateAllPDFs(data) {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const results = [];
    for (let i = 0; i < DOC_TYPES.length; i++) {
      const doc = DOC_TYPES[i];
      const html = buildDocument(doc, data);
      const buffer = await renderPDF(browser, html);
      results.push({
        filename: `${String(i + 1).padStart(2, '0')}-${doc.id}.pdf`,
        title: doc.title,
        description: doc.description,
        buffer,
      });
    }
    return results;
  } finally {
    await browser.close();
  }
}

async function renderPDF(browser, html) {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:0;"></div>`,
      footerTemplate: `
        <div style="width:100%;padding:0 0.75in;font-family:-apple-system,'Segoe UI',sans-serif;
          font-size:8pt;color:#94A3B8;display:flex;justify-content:space-between;align-items:center;
          border-top:1px solid #E8F0FE;box-sizing:border-box;">
          <span class="title" style="color:#1B3A6B;font-weight:600;"></span>
          <span><span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
      margin: { top: '0.75in', bottom: '0.6in', left: '0.75in', right: '0.75in' },
    });
  } finally {
    await page.close();
  }
}

// ─── Document builder ─────────────────────────────────────────────────────────

function buildDocument(doc, data) {
  let bodyContent;
  switch (doc.id) {
    case 'overview':        bodyContent = buildOverview(data); break;
    case 'data-dictionary': bodyContent = buildDataDictionary(data); break;
    case 'workflow':        bodyContent = buildWorkflow(data); break;
    case 'rules':           bodyContent = buildRules(data); break;
    case 'layout':          bodyContent = buildLayout(data); break;
    case 'security':        bodyContent = buildSecurity(data); break;
    case 'test-scripts':    bodyContent = buildTestScripts(data); break;
    default:                bodyContent = '<p>Content unavailable.</p>';
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${baseCSS()}</style>
</head>
<body>
${cover(data.metadata, doc.title)}
<div class="pb"></div>
${pageHeader(data.metadata, doc.title)}
${bodyContent}
</body>
</html>`;
}

// ─── Cover page ───────────────────────────────────────────────────────────────

function cover(meta, docTitle) {
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return `
<div class="cover">
  <div class="cover-top">
    <div class="cover-brand">DevonWay · Module Documentation</div>
    <div class="cover-doc-badge">${esc(docTitle)}</div>
    <h1 class="cover-title">${esc(meta.name)}</h1>
    ${meta.description ? `<p class="cover-desc">${esc(meta.description)}</p>` : ''}
  </div>
  <div class="cover-circles">
    <div class="circle c1"></div>
    <div class="circle c2"></div>
    <div class="circle c3"></div>
  </div>
  <div class="cover-bottom">
    <div class="cover-meta">
      ${meta.prefix ? metaChip('Prefix', meta.prefix) : ''}
      ${meta.category ? metaChip('Category', meta.category) : ''}
      ${metaChip('Type', meta.moduleType)}
      ${meta.version ? metaChip('Version', meta.version) : ''}
    </div>
    <div class="cover-date">Generated ${now}</div>
  </div>
</div>`;
}

function metaChip(label, value) {
  return `<div class="meta-chip"><div class="meta-label">${esc(label)}</div><div class="meta-value">${esc(value)}</div></div>`;
}

// ─── Page header (after cover) ────────────────────────────────────────────────

function pageHeader(meta, docTitle) {
  return `
<div class="page-header">
  <div>
    <div class="ph-doc-type">${esc(docTitle)}</div>
    <div class="ph-module">${esc(meta.name)}</div>
  </div>
  ${meta.prefix ? `<div class="ph-prefix">${esc(meta.prefix)}</div>` : ''}
</div>`;
}

// ─── Content builders ─────────────────────────────────────────────────────────

function buildOverview(data) {
  const { metadata: m, statistics: s, fields, workflow, roles, developerNotes } = data;
  const parts = [];

  // Key stats
  parts.push(section('Module At a Glance', '', `
    <div class="stats-grid">
      ${statCard(s.totalFields, 'Total Fields')}
      ${statCard(s.totalLevels, 'Data Levels')}
      ${statCard(s.totalWorkflowTasks, 'Workflow Tasks')}
      ${statCard(s.totalRoles, 'Roles')}
      ${statCard(s.totalRules, 'Rules')}
      ${statCard(s.totalRegions, 'Regions')}
    </div>`));

  // Properties
  const propRows = [
    ['Module Name', m.name],
    ...(m.moduleCode ? [['Module Code', m.moduleCode]] : []),
    ['Identifier Prefix', m.prefix || '—'],
    ['Category', m.category || '—'],
    ['Module Type', m.moduleType],
    ['Workflow Enabled', m.workflowFlag ? 'Yes' : 'No'],
    ...(m.version ? [['Version', m.version]] : []),
    ...(m.description ? [['Description', m.description]] : []),
  ];

  parts.push(section('Module Properties', '', `
    <table>
      <tbody>${propRows.map(([k, v]) => `<tr><td class="prop-key">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody>
    </table>`));

  // Field type breakdown
  if (s.totalFields > 0) {
    const typeRows = Object.entries(s.fieldsByType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => {
        const NAMES = { BU:'Button', CL:'Character (Large)', CS:'Character (Small)', CB:'Checkbox', D:'Date', N:'Numeric', P:'Picklist', R:'Reference', T:'Time', VC:'Virtual (Char)', VD:'Virtual (Date)', VH:'Virtual (HTML)', VN:'Virtual (Numeric)', VP:'Virtual (Picklist)', VR:'Virtual (Reference)', CR:'Chart/Report', GF:'Graphic' };
        return `<tr><td><span class="code">${esc(type)}</span></td><td>${esc(NAMES[type] || type)}</td><td>${count}</td></tr>`;
      }).join('');

    parts.push(section('Field Composition', `${s.totalFields} fields`, `
      <table>
        <thead><tr><th>Code</th><th>Type</th><th>Count</th></tr></thead>
        <tbody>${typeRows}</tbody>
      </table>`));
  }

  // Field highlights
  const highlights = [
    { label: 'Identifying Fields', count: s.identifyingFields, desc: 'Fields used to identify records' },
    { label: 'Search Indexed', count: s.searchIndexedFields, desc: 'Fields included in the search index' },
    { label: 'History Tracked', count: s.trackedFields, desc: 'Fields with before/after value logging' },
    { label: 'Required Fields', count: s.requiredFields, desc: 'Fields with required behavior' },
    { label: 'Calculated Fields', count: s.calculatedFields, desc: 'Virtual or formula-driven fields' },
    { label: 'Reference Fields', count: s.referenceFields, desc: 'Fields linking to other modules' },
  ].filter(h => h.count > 0);

  if (highlights.length > 0) {
    parts.push(section('Field Highlights', '', `
      <div class="highlight-grid">
        ${highlights.map(h => `
          <div class="highlight-card">
            <div class="highlight-num">${h.count}</div>
            <div class="highlight-label">${esc(h.label)}</div>
            <div class="highlight-desc">${esc(h.desc)}</div>
          </div>`).join('')}
      </div>`));
  }

  // Workflow summary
  if (workflow.tasks.length > 0) {
    const flow = workflow.tasks.map((t, i) =>
      `<div class="wf-step">${esc(t.name || t.code || `Step ${i+1}`)}</div>${i < workflow.tasks.length - 1 ? '<div class="wf-arrow">→</div>' : ''}`
    ).join('');
    parts.push(section('Workflow Overview', `${workflow.tasks.length} tasks`, `
      <div class="wf-flow">${flow}</div>`));
  }

  // Developer notes
  if (developerNotes) {
    parts.push(section('Developer Notes', '', `<div class="notes">${esc(developerNotes)}</div>`));
  }

  return parts.join('');
}

function buildDataDictionary(data) {
  const { fields, levels } = data;
  const parts = [];

  if (fields.length === 0) {
    return emptyState('No Fields Found', 'No field definitions were detected in this module export.');
  }

  // Group fields by level
  const byLevel = {};
  for (const f of fields) {
    const lvl = f.level || 'H';
    if (!byLevel[lvl]) byLevel[lvl] = [];
    byLevel[lvl].push(f);
  }

  // Sort levels: H first, then C1, C2, etc.
  const levelOrder = Object.keys(byLevel).sort((a, b) => {
    if (a === 'H') return -1;
    if (b === 'H') return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  for (const levelCode of levelOrder) {
    const levelFields = byLevel[levelCode].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    const declaredLevel = levels.find(l => l.code === levelCode);
    const levelName = declaredLevel?.name || (levelCode === 'H' ? 'Header Level' : `Child Level ${levelCode.replace('C', '')}`);

    const rows = levelFields.map(f => {
      const badges = [];
      if (f.identifying) badges.push(badge('Identifying', 'navy'));
      if (f.searchIndexed) badges.push(badge('Indexed', 'green'));
      if (f.trackHistory) badges.push(badge('Tracked', 'yellow'));
      if (f.calculated) badges.push(badge('Calculated', 'blue'));
      if (f.refreshOnChange) badges.push(badge('Refresh', 'gray'));

      const details = [];
      if (f.width) details.push(`Width: ${f.width}`);
      if (f.height) details.push(`Height: ${f.height}`);
      if (f.printRegion) details.push(`Print: ${f.printRegion}`);
      if (f.picklist.length > 0) details.push(`${f.picklist.length} values`);

      return `<tr>
        <td><span class="code">${esc(f.subCode || f.code)}</span></td>
        <td>${esc(f.prompt || f.name || '—')}</td>
        <td>${esc(f.typeFull || f.type)}</td>
        <td>${badges.join(' ')}</td>
        <td class="muted">${esc(details.join(' · ') || '—')}</td>
      </tr>`;
    }).join('');

    parts.push(`
      <div class="level-block">
        <div class="level-header">
          <span class="level-title">${esc(levelName)}</span>
          <span class="level-code">${esc(levelCode)}</span>
          <span class="level-count">${levelFields.length} fields</span>
        </div>
        <table>
          <thead><tr><th>Field Code</th><th>Prompt / Name</th><th>Type</th><th>Flags</th><th>Details</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);

    // Field detail cards for fields with extra info
    const detailFields = levelFields.filter(f => f.helpText || f.picklist.length > 0);

    if (detailFields.length > 0) {
      const cards = detailFields.map(f => {
        const items = [];
        if (f.helpText) items.push(`<div class="detail-row"><span class="detail-label">Help Text</span><span>${esc(f.helpText)}</span></div>`);
        if (f.picklist.length > 0) {
          const pvs = f.picklist.map(v => `<span class="pv">${esc(v.label || v.value)}</span>`).join('');
          items.push(`<div class="detail-row"><span class="detail-label">Picklist Values</span><div class="pv-list">${pvs}</div></div>`);
        }
        return `<div class="detail-card">
          <div class="detail-header"><span class="code">${esc(f.subCode || f.code)}</span> <span class="detail-prompt">${esc(f.prompt || f.name || '')}</span></div>
          ${items.join('')}
        </div>`;
      }).join('');

      parts.push(`<div class="detail-section"><div class="subsection-title">Field Details — ${esc(levelName)}</div>${cards}</div>`);
    }
  }

  return parts.join('');
}

function buildWorkflow(data) {
  const { workflow, metadata: m } = data;
  const parts = [];

  const segments = workflow.segments || [];

  if (segments.length === 0) {
    return emptyState('No Workflow Configured', m.workflowFlag
      ? 'Workflow is enabled but no tasks were found in this export.'
      : 'This module does not use workflow. It is a non-workflow data module.');
  }

  // Visual flow diagram — segments as steps
  const flowSteps = segments.map((s, i) =>
    `<div class="wf-step">${esc(s.name || s.code || `Stage ${i+1}`)}</div>${i < segments.length - 1 ? '<div class="wf-arrow">→</div>' : ''}`
  ).join('');

  const totalEvents = segments.reduce((n, s) => n + s.events.length, 0);
  parts.push(section('Process Flow', `${segments.length} stages · ${totalEvents} tasks`, `
    <div class="wf-flow">${flowSteps}</div>`));

  // Segment + event detail cards
  parts.push(`<div class="section-title-only">Stage &amp; Task Definitions</div>`);

  for (const [i, seg] of segments.entries()) {
    const TASK_ORDER = { P: 'Parallel', S: 'Sequential' };
    const orderLabel = TASK_ORDER[seg.taskOrder] || seg.taskOrder;

    let segContent = '';
    if (seg.taskOrder) {
      segContent += `<div class="task-section-label">Task Order: ${esc(orderLabel)}</div>`;
    }

    if (seg.events.length > 0) {
      const rows = seg.events.map((ev, ei) => {
        const flags = [];
        if (ev.allowRollback) flags.push('Rollback');
        if (ev.allowCancel) flags.push('Cancel');
        if (ev.allowRollForward) flags.push('Roll Forward');
        if (ev.allowSubTasks) flags.push('Sub-Tasks');
        return `<tr>
          <td>${ei + 1}</td>
          <td>${esc(ev.name || ev.code)}</td>
          <td><span class="code">${esc(ev.code)}</span></td>
          <td class="muted">${flags.join(', ') || '—'}</td>
        </tr>`;
      }).join('');
      segContent += `
        <table>
          <thead><tr><th>#</th><th>Task Name</th><th>Code</th><th>Allowed Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    parts.push(`
      <div class="task-card">
        <div class="task-header">
          <div class="task-num">${i + 1}</div>
          <div class="task-info">
            <div class="task-name">${esc(seg.name || seg.code || `Stage ${i + 1}`)}</div>
            <div class="task-code">Code: ${esc(seg.code)}</div>
          </div>
          ${seg.events.length > 0 ? `<div style="margin-left:auto;opacity:0.7;font-size:9pt">${seg.events.length} task${seg.events.length !== 1 ? 's' : ''}</div>` : ''}
        </div>
        <div class="task-body">${segContent || '<span class="muted">No tasks defined.</span>'}</div>
      </div>`);
  }

  return parts.join('');
}

function buildRules(data) {
  const { rules } = data;
  const parts = [];

  if (rules.length === 0) {
    return emptyState('No Rules Found', 'No module rules were found in this module export.');
  }

  // Group rules by type
  const RULE_TYPE_NAMES = { MB: 'Module Behavior', WF: 'Workflow', SC: 'Security', EM: 'Email', BS: 'Batch' };
  const byType = {};
  for (const r of rules) {
    const key = r.ruleType || 'Other';
    if (!byType[key]) byType[key] = [];
    byType[key].push(r);
  }

  parts.push(section('Module Rules', `${rules.length} rules`, ''));

  for (const [ruleType, ruleSet] of Object.entries(byType)) {
    const typLabel = RULE_TYPE_NAMES[ruleType] || ruleType;
    const ruleCards = ruleSet.map(r => {
      const TARGET_LABELS = {
        IN: 'Invisible', NM: 'Non-Modifiable', RQ: 'Required',
        DFT: 'Default', GR: 'Grid', BL: 'Bold', IT: 'Italics',
        BC: 'Bg Color', TC: 'Text Color',
      };
      const targetRows = r.targets.map(t => {
        const tLabel = TARGET_LABELS[t.targetType] || t.targetType;
        const badgeColor = t.targetType === 'RQ' ? 'red' : t.targetType === 'IN' ? 'yellow' : t.targetType === 'NM' ? 'blue' : 'gray';
        return `<tr>
          <td><span class="code">${esc(t.targetCode || '—')}</span></td>
          <td>${badge(tLabel, badgeColor)}</td>
          <td class="muted">${t.targetLogic ? esc(t.targetLogic) : '—'}</td>
        </tr>`;
      }).join('');

      return `<div class="calc-block">
        <div class="calc-header">
          <span style="font-weight:700;color:#1B3A6B">${esc(r.name || r.code)}</span>
          ${r.sortOrder ? `<span class="badge badge-gray">Order: ${r.sortOrder}</span>` : ''}
          <span class="badge badge-blue">${r.targets.length} target${r.targets.length !== 1 ? 's' : ''}</span>
        </div>
        ${r.condition ? `<div class="code-block">${esc(r.condition)}</div>` : ''}
        ${r.targets.length > 0 ? `
          <table class="behavior-table" style="margin-top:6px">
            <thead><tr><th>Target Field</th><th>Behavior</th><th>Value / Logic</th></tr></thead>
            <tbody>${targetRows}</tbody>
          </table>` : ''}
      </div>`;
    }).join('');

    parts.push(`
      <div class="subsection">
        <div class="subsection-title">${esc(typLabel)} — ${ruleSet.length} rule${ruleSet.length !== 1 ? 's' : ''}</div>
        ${ruleCards}
      </div>`);
  }

  return parts.join('');
}

function buildLayout(data) {
  const { regions, fields } = data;
  const parts = [];

  if (regions.length === 0 && fields.every(f => !f.region)) {
    return emptyState('No Layout Data Found', 'No region or layout definitions were found in this module export.');
  }

  // Region summary
  if (regions.length > 0) {
    const STYLES = { GR: 'Grid', CS: 'Card Stack', HP: 'Horizontal', VP: 'Vertical', TG: 'Tab Group' };
    const rows = regions.map(r => {
      const parentCell = r.parentRegion ? esc(r.parentRegion) : '—';
      return `<tr><td><span class="code">${esc(r.code)}</span></td><td>${esc(r.name || '—')}</td><td>${esc(STYLES[r.style] || r.style || '—')}</td><td>${esc(r.level || '—')}</td><td>${parentCell}</td></tr>`;
    }).join('');
    parts.push(section('Screen Regions', `${regions.length} regions`, `
      <table>
        <thead><tr><th>Code</th><th>Name</th><th>Style</th><th>Level</th><th>Parent</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`));
  }

  // Fields grouped by region
  const fieldsWithRegion = fields.filter(f => f.region);
  if (fieldsWithRegion.length > 0) {
    const byRegion = {};
    for (const f of fieldsWithRegion) {
      if (!byRegion[f.region]) byRegion[f.region] = [];
      byRegion[f.region].push(f);
    }
    const regionMap = {};
    for (const r of regions) regionMap[r.code] = r.name;

    parts.push(section('Field Region Assignments', '', ''));
    for (const [regionCode, regionFields] of Object.entries(byRegion)) {
      const regionLabel = regionMap[regionCode] ? `${regionMap[regionCode]} (${regionCode})` : regionCode;
      const rows = regionFields
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
        .map(f => {
          return `<tr><td><span class="code">${esc(f.subCode || f.code)}</span></td><td>${esc(f.prompt || f.name || '—')}</td><td>${esc(f.typeFull || f.type)}</td><td>${f.order || '—'}</td><td class="muted">${esc(f.printRegion || '—')}</td></tr>`;
        }).join('');
      parts.push(`
        <div class="subsection">
          <div class="subsection-title">${esc(regionLabel)}</div>
          <table>
            <thead><tr><th>Field Code</th><th>Prompt</th><th>Type</th><th>Order</th><th>Print Region</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`);
    }
  }

  return parts.join('');
}

function buildSecurity(data) {
  const { roles, rules } = data;
  const parts = [];

  if (roles.length === 0) {
    return emptyState('No Role Definitions Found', 'No role or security configurations were found in this module export.');
  }

  parts.push(section('Module Roles', `${roles.length} roles defined`, `
    <table>
      <thead><tr><th>Role Name</th><th>Code</th><th>Edit</th><th>Delete</th><th>Search All</th><th>Superuser</th><th>Initiate</th></tr></thead>
      <tbody>${roles.map(r => `<tr>
        <td><strong>${esc(r.name || '—')}</strong></td>
        <td><span class="code">${esc(r.code || '—')}</span></td>
        <td>${r.canEdit ? badge('Yes', 'green') : badge('No', 'gray')}</td>
        <td>${r.canDelete ? badge('Yes', 'red') : badge('No', 'gray')}</td>
        <td>${r.allowSearchAll ? badge('Yes', 'blue') : badge('No', 'gray')}</td>
        <td>${r.isSuperuser ? badge('Yes', 'yellow') : '—'}</td>
        <td>${r.allowInitiate ? badge('Yes', 'green') : badge('No', 'gray')}</td>
      </tr>`).join('')}</tbody>
    </table>`));

  const securityRules = rules.filter(r =>
    r.targets.some(t => ['IN', 'NM', 'RQ'].includes(t.targetType))
  );

  if (securityRules.length > 0) {
    const TARGET_LABELS = { IN: 'Invisible', NM: 'Non-Modifiable', RQ: 'Required' };
    const COLORS = { IN: 'yellow', NM: 'blue', RQ: 'red' };
    const rows = securityRules.map(r => {
      const targets = r.targets
        .filter(t => ['IN', 'NM', 'RQ'].includes(t.targetType))
        .map(t => `<span class="code" style="font-size:7pt">${esc(t.targetCode)}</span> ${badge(TARGET_LABELS[t.targetType] || t.targetType, COLORS[t.targetType] || 'gray')}`)
        .join('<br>');
      return `<tr>
        <td>${esc(r.name || r.code)}</td>
        <td>${r.condition ? `<div class="code-block">${esc(r.condition)}</div>` : '—'}</td>
        <td>${targets}</td>
      </tr>`;
    }).join('');
    parts.push(section('Field Access Rules', `${securityRules.length} rules controlling field visibility/access`, `
      <table>
        <thead><tr><th>Rule Name</th><th>Condition (DXL)</th><th>Field / Behavior</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`));
  }

  return parts.join('');
}

// ─── Reusable components ──────────────────────────────────────────────────────

function section(title, badge_text, content) {
  return `
<div class="section">
  <div class="section-head">
    <span class="section-title">${esc(title)}</span>
    ${badge_text ? `<span class="section-badge">${esc(badge_text)}</span>` : ''}
  </div>
  ${content}
</div>`;
}

function statCard(num, label) {
  return `<div class="stat-card"><div class="stat-num">${num}</div><div class="stat-label">${esc(label)}</div></div>`;
}

function badge(text, color) {
  return `<span class="badge badge-${color}">${esc(text)}</span>`;
}

function emptyState(title, desc) {
  return `<div class="empty-state"><div class="empty-icon">⬜</div><div class="empty-title">${esc(title)}</div><div class="empty-desc">${esc(desc)}</div></div>`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

function baseCSS() {
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system,'Segoe UI',system-ui,sans-serif; font-size: 10pt; line-height: 1.55; color: #1A202C; background: white; }

/* ─ Cover ─ */
.cover {
  width: 100vw; height: 100vh; position: relative; overflow: hidden;
  background: linear-gradient(145deg, #0F2447 0%, #1B3A6B 45%, #0073E6 100%);
  color: white; display: flex; flex-direction: column; justify-content: space-between;
}
.cover-top { padding: 64px 72px 0; }
.cover-brand { font-size: 9pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.55; margin-bottom: 52px; }
.cover-doc-badge {
  display: inline-block; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25);
  border-radius: 4px; padding: 5px 14px; font-size: 8.5pt; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 20px;
}
.cover-title { font-size: 38pt; font-weight: 800; line-height: 1.05; letter-spacing: -1px; margin-bottom: 14px; }
.cover-desc { font-size: 12pt; opacity: 0.7; max-width: 480px; }

.circle { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.04); }
.c1 { width: 560px; height: 560px; top: -180px; right: -120px; }
.c2 { width: 320px; height: 320px; bottom: 60px; right: 80px; background: rgba(255,255,255,0.06); }
.c3 { width: 180px; height: 180px; bottom: -60px; left: 280px; background: rgba(255,255,255,0.07); }

.cover-bottom { padding: 0 72px 56px; position: relative; z-index: 2; }
.cover-meta { display: flex; gap: 32px; margin-bottom: 24px; flex-wrap: wrap; }
.meta-chip .meta-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.5; margin-bottom: 3px; }
.meta-chip .meta-value { font-size: 11pt; font-weight: 700; }
.cover-date { font-size: 8.5pt; opacity: 0.5; }

/* ─ Page break ─ */
.pb { page-break-after: always; }

/* ─ Page header ─ */
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; border-bottom: 3px solid #1B3A6B; margin-bottom: 28px;
}
.ph-doc-type { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #0073E6; margin-bottom: 3px; }
.ph-module { font-size: 18pt; font-weight: 800; color: #1B3A6B; }
.ph-prefix {
  background: #1B3A6B; color: white; padding: 6px 16px; border-radius: 6px;
  font-size: 14pt; font-weight: 800; letter-spacing: 0.05em;
}

/* ─ Sections ─ */
.section { margin-bottom: 28px; }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #D1E0F7; }
.section-title { font-size: 14pt; font-weight: 800; color: #1B3A6B; flex: 1; }
.section-badge { background: #EBF3FD; color: #0073E6; font-size: 8pt; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
.section-title-only { font-size: 13pt; font-weight: 800; color: #1B3A6B; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #D1E0F7; }
.subsection { margin-bottom: 20px; }
.subsection-title { font-size: 10.5pt; font-weight: 700; color: #1B3A6B; padding: 6px 12px; border-left: 3px solid #0073E6; background: #F8FAFF; margin-bottom: 8px; border-radius: 0 4px 4px 0; }

/* ─ Tables ─ */
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 8.5pt; border: 1px solid #D1E0F7; border-radius: 6px; overflow: hidden; }
th { background: #1B3A6B; color: white; padding: 7px 11px; text-align: left; font-weight: 700; font-size: 7.5pt; letter-spacing: 0.06em; text-transform: uppercase; }
td { padding: 7px 11px; border-bottom: 1px solid #E8F0FE; vertical-align: top; }
tr:last-child td { border-bottom: none; }
tr:nth-child(even) td { background: #F8FAFF; }
.prop-key { font-weight: 600; color: #1B3A6B; width: 160px; white-space: nowrap; }
.behavior-table th, .behavior-table td { font-size: 8pt; }
.muted { color: #64748B; font-size: 8pt; }
.dxl { min-width: 200px; }

/* ─ Code ─ */
.code { background: #EBF3FD; color: #0F2447; padding: 1px 6px; border-radius: 3px; font-family: 'Consolas','Courier New',monospace; font-size: 8pt; font-weight: 700; }
.code-block {
  background: #1E293B; color: #93C5FD; padding: 10px 14px; border-radius: 5px;
  font-family: 'Consolas','Courier New',monospace; font-size: 8pt; line-height: 1.6;
  margin: 6px 0; white-space: pre-wrap; word-break: break-all;
}

/* ─ Badges ─ */
.badge { display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 7.5pt; font-weight: 700; white-space: nowrap; margin: 1px; }
.badge-blue   { background: #DBEAFE; color: #1D4ED8; }
.badge-green  { background: #D1FAE5; color: #065F46; }
.badge-yellow { background: #FEF3C7; color: #92400E; }
.badge-red    { background: #FEE2E2; color: #991B1B; }
.badge-gray   { background: #F1F5F9; color: #475569; }
.badge-navy   { background: #1B3A6B; color: white; }

/* ─ Stats ─ */
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
.stat-card { background: linear-gradient(135deg, #EBF3FD, #F8FAFF); border: 1px solid #D1E0F7; border-radius: 8px; padding: 16px; text-align: center; }
.stat-num { font-size: 28pt; font-weight: 900; color: #1B3A6B; line-height: 1; }
.stat-label { font-size: 7.5pt; color: #64748B; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }

/* ─ Highlights ─ */
.highlight-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.highlight-card { background: #F8FAFF; border: 1px solid #D1E0F7; border-radius: 8px; padding: 14px; }
.highlight-num { font-size: 22pt; font-weight: 900; color: #0073E6; line-height: 1; }
.highlight-label { font-size: 9pt; font-weight: 700; color: #1B3A6B; margin: 2px 0; }
.highlight-desc { font-size: 7.5pt; color: #64748B; }

/* ─ Level blocks ─ */
.level-block { margin-bottom: 24px; }
.level-header {
  background: linear-gradient(135deg, #1B3A6B, #2D5AA0); color: white;
  padding: 12px 16px; border-radius: 6px 6px 0 0; display: flex; align-items: center; gap: 12px;
}
.level-title { font-weight: 700; font-size: 11pt; flex: 1; }
.level-code { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 9pt; }
.level-count { font-size: 8pt; opacity: 0.75; }
.level-block table { border-radius: 0 0 6px 6px; border-top: none; }

/* ─ Field detail ─ */
.detail-section { margin-bottom: 28px; }
.detail-card { border: 1px solid #D1E0F7; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
.detail-header { background: #EBF3FD; padding: 8px 12px; display: flex; align-items: center; gap: 8px; }
.detail-prompt { color: #1B3A6B; font-weight: 600; font-size: 9pt; }
.detail-row { padding: 8px 12px; border-top: 1px solid #E8F0FE; }
.detail-label { display: block; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B; margin-bottom: 4px; }
.pv-list { display: flex; flex-wrap: wrap; gap: 4px; }
.pv { background: #F1F5F9; border: 1px solid #E2E8F0; border-radius: 4px; padding: 2px 8px; font-size: 8pt; }

/* ─ Workflow ─ */
.wf-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 16px; background: #F8FAFF; border: 1px solid #D1E0F7; border-radius: 8px; margin-bottom: 16px; }
.wf-step { background: #1B3A6B; color: white; padding: 7px 14px; border-radius: 6px; font-size: 9pt; font-weight: 700; }
.wf-arrow { color: #0073E6; font-size: 16pt; font-weight: 700; line-height: 1; }
.task-card { border: 1px solid #D1E0F7; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
.task-header { background: linear-gradient(135deg, #1B3A6B, #2D5AA0); color: white; padding: 14px 16px; display: flex; align-items: center; gap: 14px; }
.task-num { background: rgba(255,255,255,0.2); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 12pt; flex-shrink: 0; text-align: center; line-height: 32px; }
.task-name { font-size: 12pt; font-weight: 700; }
.task-code { font-size: 8pt; opacity: 0.7; margin-top: 2px; }
.task-body { padding: 14px 16px; }
.task-desc { font-size: 9pt; color: #475569; margin-bottom: 12px; }
.task-section-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748B; margin: 12px 0 6px; }

/* ─ Rules ─ */
.calc-block { border: 1px solid #D1E0F7; border-radius: 6px; margin-bottom: 10px; overflow: hidden; }
.calc-header { background: #EBF3FD; padding: 8px 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.calc-prompt { color: #1B3A6B; font-weight: 600; flex: 1; }
.func-card { border: 1px solid #D1E0F7; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
.func-header { background: #1B3A6B; color: white; padding: 10px 14px; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.func-name { font-family: 'Consolas','Courier New',monospace; font-size: 11pt; font-weight: 700; }
.func-sig { font-family: 'Consolas','Courier New',monospace; font-size: 9pt; opacity: 0.7; }
.func-desc { padding: 8px 14px; font-size: 9pt; color: #475569; border-bottom: 1px solid #E8F0FE; }

/* ─ Notes ─ */
.notes { background: #FFFBEB; border: 1px solid #FDE68A; border-left: 4px solid #D97706; border-radius: 0 6px 6px 0; padding: 14px; font-size: 8.5pt; white-space: pre-wrap; font-family: 'Consolas','Courier New',monospace; color: #78350F; }

/* ─ Empty state ─ */
.empty-state { text-align: center; padding: 48px 40px; background: #F8FAFF; border: 1px dashed #CBD5E1; border-radius: 8px; }
.empty-icon { font-size: 28pt; margin-bottom: 10px; color: #CBD5E1; }
.empty-title { font-size: 12pt; font-weight: 700; color: #475569; margin-bottom: 6px; }
.empty-desc { font-size: 9pt; color: #94A3B8; }

/* ─ Test Scripts ─ */
.ts-intro { background: linear-gradient(135deg, #EBF3FD, #F8FAFF); border: 1px solid #D1E0F7; border-left: 5px solid #0073E6; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px; }
.ts-intro-title { font-size: 11pt; font-weight: 800; color: #1B3A6B; margin-bottom: 8px; }
.ts-intro-body p { font-size: 9pt; color: #475569; margin-bottom: 10px; line-height: 1.6; }
.ts-legend { display: flex; gap: 20px; flex-wrap: wrap; }
.ts-legend-item { display: flex; align-items: center; gap: 6px; font-size: 8pt; color: #475569; }
.ts-status { display: inline-block; padding: 1px 7px; border-radius: 4px; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.05em; }
.ts-pass    { background: #D1FAE5; color: #065F46; }
.ts-fail    { background: #FEE2E2; color: #991B1B; }
.ts-blocked { background: #FEF3C7; color: #92400E; }
.ts-na      { background: #F1F5F9; color: #475569; }

.ts-prereq-table { margin-bottom: 14px; }
.ts-check-col { width: 60px; text-align: center; background: #FAFAFA; border-left: 2px solid #E2E8F0; }

.ts-tester-block { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 14px; background: #F8FAFF; border: 1px solid #D1E0F7; border-radius: 6px; }
.ts-tester-row { display: flex; align-items: center; gap: 8px; }
.ts-tester-label { font-size: 8pt; font-weight: 700; color: #1B3A6B; white-space: nowrap; min-width: 110px; }
.ts-tester-line { flex: 1; border-bottom: 1.5px solid #94A3B8; min-width: 80px; height: 16px; }

/* Test case card */
.ts-card { border: 1px solid #D1E0F7; border-radius: 8px; margin-bottom: 20px; overflow: hidden; page-break-inside: avoid; }
.ts-card-header { background: linear-gradient(135deg, #1B3A6B, #2D5AA0); color: white; padding: 12px 16px; display: flex; align-items: flex-start; gap: 14px; }
.ts-card-id { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; padding: 3px 10px; font-family: 'Consolas','Courier New',monospace; font-size: 8.5pt; font-weight: 800; white-space: nowrap; }
.ts-card-obj { flex: 1; font-size: 10pt; font-weight: 700; line-height: 1.3; padding-top: 1px; }
.ts-card-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.ts-role-badge { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25); border-radius: 4px; padding: 2px 8px; font-size: 7.5pt; font-weight: 700; white-space: nowrap; }
.ts-card-precond { background: #FFFBEB; border-bottom: 1px solid #FDE68A; padding: 8px 16px; font-size: 8.5pt; color: #78350F; }
.ts-precond-label { font-weight: 700; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.08em; }
.ts-inline-code { background: #FEF3C7; color: #78350F; padding: 0 5px; border-radius: 3px; font-size: 7.5pt; font-family: 'Consolas','Courier New',monospace; }

/* Steps table */
.ts-steps-table { border-radius: 0; border: none; border-top: 1px solid #E8F0FE; margin: 0; }
.ts-steps-table th { background: #2D5AA0; font-size: 7pt; padding: 6px 8px; }
.ts-steps-table td { font-size: 8pt; padding: 7px 8px; vertical-align: top; border-bottom: 1px solid #EEF2FF; }
.ts-steps-table tr:last-child td { border-bottom: none; }
.ts-steps-table tr:nth-child(even) td { background: #F8FAFF; }
.ts-step-num { text-align: center; font-weight: 700; color: #1B3A6B; width: 26px; background: #EBF3FD !important; }
.ts-step-action { color: #1A202C; }
.ts-step-data { color: #475569; font-size: 7.5pt; font-style: italic; }
.ts-step-expected { color: #065F46; font-size: 8pt; }
.ts-step-actual { background: #FAFFF8 !important; border-left: 2px solid #6EE7B7; }
.ts-step-status { text-align: center; background: #FFF8F8 !important; border-left: 2px solid #FCA5A5; }
.ts-status-check { font-size: 7pt; line-height: 1.8; color: #475569; text-align: left; white-space: nowrap; }

/* Sign-off */
.ts-signoff { }
.ts-summary-table { max-width: 320px; margin-bottom: 24px; }
.ts-signoff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
.ts-signoff-block { }
.ts-signoff-label { font-size: 8pt; font-weight: 700; color: #1B3A6B; margin-bottom: 28px; }
.ts-signoff-line { border-bottom: 1.5px solid #1B3A6B; margin-bottom: 4px; }
.ts-signoff-sublabel { font-size: 7.5pt; color: #94A3B8; }
.ts-comments-box { border: 1px solid #D1E0F7; border-radius: 6px; padding: 12px; min-height: 80px; }
.ts-comments-label { font-size: 8pt; font-weight: 700; color: #94A3B8; }
`;
}

// ─── Test Scripts ─────────────────────────────────────────────────────────────

function buildTestScripts(data) {
  const { metadata: m, fields, workflow, roles, rules } = data;
  const parts = [];
  let tcNum = 1;

  const prefix = m.prefix || m.moduleCode || 'TC';
  const tcId = (n) => `${prefix}-TS-${String(n).padStart(3, '0')}`;

  // Intro / how to use
  parts.push(`
<div class="ts-intro">
  <div class="ts-intro-title">How to Use This Test Script</div>
  <div class="ts-intro-body">
    <p>This document provides structured User Acceptance Testing (UAT) scenarios for the <strong>${esc(m.name)}</strong> module.
    Each test case follows a standard format: objective, prerequisites, step-by-step actions, expected results, and capture fields for actual results and pass/fail status.</p>
    <div class="ts-legend">
      <div class="ts-legend-item"><span class="ts-status ts-pass">PASS</span> Test completed successfully</div>
      <div class="ts-legend-item"><span class="ts-status ts-fail">FAIL</span> Actual result did not match expected</div>
      <div class="ts-legend-item"><span class="ts-status ts-blocked">BLOCKED</span> Could not execute — document reason</div>
      <div class="ts-legend-item"><span class="ts-status ts-na">N/A</span> Not applicable in this environment</div>
    </div>
  </div>
</div>`);

  // ── SECTION A: Prerequisites ──────────────────────────────────────────────
  parts.push(section('A. Test Prerequisites', '', `
    <table class="ts-prereq-table">
      <thead><tr><th>#</th><th>Prerequisite</th><th>Verified ✓</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Test environment is accessible and available</td><td class="ts-check-col"></td></tr>
        <tr><td>2</td><td>Tester has a valid DevonWay user account with access to the <strong>${esc(m.name)}</strong> module</td><td class="ts-check-col"></td></tr>
        ${roles.length > 0 ? `<tr><td>3</td><td>Test accounts are configured for the following roles: <strong>${roles.map(r => esc(r.name || r.code)).join(', ')}</strong></td><td class="ts-check-col"></td></tr>` : ''}
        <tr><td>${roles.length > 0 ? 4 : 3}</td><td>Any reference modules linked from this module are populated with test data</td><td class="ts-check-col"></td></tr>
        <tr><td>${roles.length > 0 ? 5 : 4}</td><td>Test execution log / defect tracker is open and ready</td><td class="ts-check-col"></td></tr>
      </tbody>
    </table>
    <div class="ts-tester-block">
      <div class="ts-tester-row"><span class="ts-tester-label">Tester Name:</span><span class="ts-tester-line"></span></div>
      <div class="ts-tester-row"><span class="ts-tester-label">Test Date:</span><span class="ts-tester-line"></span></div>
      <div class="ts-tester-row"><span class="ts-tester-label">Environment:</span><span class="ts-tester-line"></span></div>
      <div class="ts-tester-row"><span class="ts-tester-label">Module Version:</span><span class="ts-tester-line"></span></div>
    </div>`));

  // ── SECTION B: Record Creation (Happy Path) ───────────────────────────────
  const identFields = fields.filter(f => f.identifying);
  const reqFields = [];
  for (const r of rules) {
    for (const t of r.targets) {
      if (t.targetType === 'RQ') {
        const f = fields.find(fi => fi.code === t.targetCode);
        if (f && !reqFields.find(x => x.code === f.code)) reqFields.push(f);
      }
    }
  }
  const picklistFields = fields.filter(f => f.picklist && f.picklist.length > 0).slice(0, 5);

  parts.push(section('B. Record Creation', '', testCase(
    tcId(tcNum++),
    'Verify that a new module record can be successfully created with valid data',
    roles.find(r => r.canInitiate || r.allowInitiate) ? (roles.find(r => r.canInitiate || r.allowInitiate).name || 'Initiator Role') : (roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User'),
    'High',
    'User is logged in with a role that has permission to create records in this module.',
    [
      { action: `Navigate to the ${esc(m.name)} module`, data: '—', expected: 'Module list view loads without errors' },
      { action: 'Click the button or link to create a new record (e.g., "New", "Add", "Initiate")', data: '—', expected: 'Blank record form opens' },
      ...identFields.slice(0, 3).map(f => ({
        action: `Enter a value in the <strong>${esc(f.prompt || f.name || f.subCode)}</strong> field`,
        data: `[Provide valid ${esc(f.type)} test value]`,
        expected: `Field accepts the value and displays it correctly`,
      })),
      ...reqFields.slice(0, 4).map(f => ({
        action: `Complete the required field: <strong>${esc(f.prompt || f.name || f.subCode)}</strong>`,
        data: `[Provide valid test value]`,
        expected: `Field is filled; required indicator is satisfied`,
      })),
      ...picklistFields.slice(0, 2).map(f => ({
        action: `Select a value from the <strong>${esc(f.prompt || f.name || f.subCode)}</strong> picklist`,
        data: f.picklist.slice(0, 3).map(v => esc(v.label || v.value)).join(' / '),
        expected: `Picklist opens and the selected value is saved`,
      })),
      { action: 'Save / submit the record', data: '—', expected: 'Record saves without errors; record ID is assigned; confirmation message or redirect occurs' },
      { action: 'Re-open the saved record', data: '—', expected: 'All entered values persist correctly' },
    ]
  )));

  // Negative: create record without required fields
  if (reqFields.length > 0) {
    parts.push(testCase(
      tcId(tcNum++),
      'Verify that saving a record without required fields is blocked with appropriate validation messages',
      roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
      'High',
      'A new record form is open.',
      [
        { action: 'Open a new record form', data: '—', expected: 'Blank form displays' },
        { action: `Leave the following required fields empty: <strong>${reqFields.slice(0, 3).map(f => esc(f.prompt || f.subCode)).join(', ')}</strong>`, data: '(leave blank)', expected: 'Fields remain empty' },
        { action: 'Attempt to save the record', data: '—', expected: `Save is blocked; validation error message identifies the missing required field(s)` },
      ]
    ));
  }

  // ── SECTION C: Workflow Stage Progression ─────────────────────────────────
  const segments = workflow.segments || [];
  if (segments.length > 0) {
    parts.push(section('C. Workflow Stage Progression', `${segments.length} stages`, ''));

    // One test case per segment transition
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const nextSeg = segments[i + 1];
      const events = seg.events || [];

      const steps = [
        { action: `Open an existing record in the <strong>${esc(seg.name || seg.code)}</strong> stage`, data: '—', expected: `Record opens; current stage is shown as "${esc(seg.name || seg.code)}"` },
        ...events.slice(0, 4).map(ev => ({
          action: `Verify that the task/action <strong>${esc(ev.name || ev.code)}</strong> is available`,
          data: '—',
          expected: `Task button or link is visible and enabled for authorized users`,
        })),
      ];

      if (events.length > 0) {
        steps.push({
          action: `Execute the primary task: <strong>${esc(events[0].name || events[0].code)}</strong>`,
          data: '[Enter any required task-specific information]',
          expected: nextSeg
            ? `Record advances to the <strong>${esc(nextSeg.name || nextSeg.code)}</strong> stage; audit trail entry is created`
            : `Record completes the workflow; final state is recorded`,
        });
      }

      if (events.some(ev => ev.allowRollback)) {
        steps.push({
          action: 'Test rollback: click the Rollback action if available',
          data: '[Enter rollback reason if prompted]',
          expected: 'Record returns to the previous stage; rollback is logged',
        });
      }

      if (events.some(ev => ev.allowCancel)) {
        steps.push({
          action: 'Test cancel: click the Cancel action on a separate test record',
          data: '[Enter cancellation reason if prompted]',
          expected: 'Record is marked as cancelled; no further workflow actions available',
        });
      }

      parts.push(testCase(
        tcId(tcNum++),
        `Verify workflow actions in the "${esc(seg.name || seg.code)}" stage`,
        roles[0] ? (roles[0].name || roles[0].code) : 'Workflow Participant',
        'High',
        `A test record exists in the <strong>${esc(seg.name || seg.code)}</strong> stage.`,
        steps
      ));
    }
  }

  // ── SECTION D: Role-Based Access ──────────────────────────────────────────
  if (roles.length > 0) {
    parts.push(section('D. Role-Based Access Control', `${roles.length} roles`, ''));

    for (const role of roles) {
      const roleName = role.name || role.code;
      const canEdit = role.editObjects;
      const canDelete = role.deleteObjects;
      const isSuperuser = role.superuser;
      const canSearch = role.allowSearch;

      const steps = [
        { action: `Log in as a user assigned to the <strong>${esc(roleName)}</strong> role`, data: '[Test account credentials for this role]', expected: 'Login succeeds; user sees the module in their navigation' },
        { action: `Navigate to the ${esc(m.name)} module`, data: '—', expected: canSearch !== false ? 'Module is accessible; record list is visible' : 'Module may not be visible or search is restricted' },
      ];

      if (canEdit) {
        steps.push({ action: 'Open a record and attempt to edit a field', data: '[Valid test value]', expected: 'Fields are editable and changes can be saved' });
      } else {
        steps.push({ action: 'Open a record and attempt to edit a field', data: '—', expected: 'Fields are read-only; no save action is available to this role' });
      }

      if (canDelete) {
        steps.push({ action: 'Attempt to delete a test record (use a throwaway record)', data: '—', expected: 'Delete action is available and executes successfully' });
      } else {
        steps.push({ action: 'Verify that the delete action is not available', data: '—', expected: 'No delete button or link is present for this role' });
      }

      if (isSuperuser) {
        steps.push({ action: 'Verify superuser capabilities: access all records regardless of assignment', data: '—', expected: 'All records are visible and manageable' });
      }

      parts.push(testCase(
        tcId(tcNum++),
        `Verify access and permissions for the "${esc(roleName)}" role`,
        roleName,
        'High',
        `A test user account is available with only the <strong>${esc(roleName)}</strong> role assigned.`,
        steps
      ));
    }
  }

  // ── SECTION E: Business Rule Validation ───────────────────────────────────
  const rqRules = rules.filter(r => r.targets.some(t => t.targetType === 'RQ'));
  const inRules  = rules.filter(r => r.targets.some(t => t.targetType === 'IN'));
  const nmRules  = rules.filter(r => r.targets.some(t => t.targetType === 'NM'));

  if (rqRules.length + inRules.length + nmRules.length > 0) {
    parts.push(section('E. Business Rule Validation', `${rules.length} rules`, ''));

    // Required rules
    for (const r of rqRules.slice(0, 5)) {
      const targets = r.targets.filter(t => t.targetType === 'RQ');
      const fieldPrompts = targets.map(t => {
        const f = fields.find(fi => fi.code === t.targetCode);
        return f ? esc(f.prompt || f.subCode || t.targetCode) : esc(t.targetCode);
      });

      parts.push(testCase(
        tcId(tcNum++),
        `Verify that rule "${esc(r.name || r.code)}" enforces required fields when condition is met`,
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'High',
        `Condition: <code class="ts-inline-code">${esc(r.condition || 'see rule logic')}</code>`,
        [
          { action: 'Open a record (or create a new one) where the rule condition is true', data: '[Set up data to satisfy the rule condition]', expected: 'Rule condition is active' },
          { action: `Verify that the following field(s) show as required: <strong>${fieldPrompts.join(', ')}</strong>`, data: '—', expected: 'Required indicator (e.g., asterisk or highlight) is visible on each field' },
          { action: 'Attempt to save without completing these fields', data: '(leave required fields empty)', expected: 'Save is blocked; validation message references the required field(s)' },
          { action: 'Complete all required fields and save', data: '[Valid values for each required field]', expected: 'Save succeeds' },
          { action: 'Set up a record where the rule condition is FALSE', data: '[Data that does NOT satisfy the rule condition]', expected: `Field(s) are no longer required; save succeeds without filling ${fieldPrompts.join(', ')}` },
        ]
      ));
    }

    // Invisible (IN) rules
    for (const r of inRules.slice(0, 3)) {
      const targets = r.targets.filter(t => t.targetType === 'IN');
      const fieldPrompts = targets.map(t => {
        const f = fields.find(fi => fi.code === t.targetCode);
        return f ? esc(f.prompt || f.subCode || t.targetCode) : esc(t.targetCode);
      });

      parts.push(testCase(
        tcId(tcNum++),
        `Verify that rule "${esc(r.name || r.code)}" hides fields when condition is met`,
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'Medium',
        `Condition: <code class="ts-inline-code">${esc(r.condition || 'see rule logic')}</code>`,
        [
          { action: 'Open a record where the rule condition is TRUE', data: '[Data satisfying the condition]', expected: 'Rule fires' },
          { action: `Verify that field(s) <strong>${fieldPrompts.join(', ')}</strong> are NOT visible on the form`, data: '—', expected: 'Field(s) are hidden / not rendered on screen' },
          { action: 'Set up a record where the rule condition is FALSE', data: '[Data NOT satisfying the condition]', expected: `Field(s) ${fieldPrompts.join(', ')} become visible` },
        ]
      ));
    }

    // Non-Modifiable (NM) rules
    for (const r of nmRules.slice(0, 3)) {
      const targets = r.targets.filter(t => t.targetType === 'NM');
      const fieldPrompts = targets.map(t => {
        const f = fields.find(fi => fi.code === t.targetCode);
        return f ? esc(f.prompt || f.subCode || t.targetCode) : esc(t.targetCode);
      });

      parts.push(testCase(
        tcId(tcNum++),
        `Verify that rule "${esc(r.name || r.code)}" makes fields read-only when condition is met`,
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'Medium',
        `Condition: <code class="ts-inline-code">${esc(r.condition || 'see rule logic')}</code>`,
        [
          { action: 'Open a record where the rule condition is TRUE', data: '[Data satisfying the condition]', expected: 'Rule fires' },
          { action: `Attempt to edit field(s): <strong>${fieldPrompts.join(', ')}</strong>`, data: '—', expected: 'Field(s) are locked / grayed out; input is not accepted' },
          { action: 'Set up a record where the rule condition is FALSE', data: '[Data NOT satisfying the condition]', expected: `Field(s) ${fieldPrompts.join(', ')} become editable` },
        ]
      ));
    }
  }

  // ── SECTION F: Field Validation ───────────────────────────────────────────
  const plFields = fields.filter(f => f.picklist && f.picklist.length > 0);
  const refFields = fields.filter(f => f.type === 'R');
  const numFields = fields.filter(f => f.type === 'N');
  const dateFields = fields.filter(f => f.type === 'D');

  if (plFields.length + refFields.length + numFields.length + dateFields.length > 0) {
    parts.push(section('F. Field Validation', '', ''));

    // Picklist fields
    if (plFields.length > 0) {
      const sample = plFields.slice(0, 3);
      parts.push(testCase(
        tcId(tcNum++),
        'Verify that picklist fields display correct values and accept only valid selections',
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'Medium',
        'Open a record in edit mode.',
        sample.flatMap(f => [
          {
            action: `Click the <strong>${esc(f.prompt || f.subCode)}</strong> picklist`,
            data: '—',
            expected: `Dropdown shows exactly these options: <em>${f.picklist.map(v => esc(v.label || v.value)).join(', ')}</em>`,
          },
          {
            action: `Select each value in turn and save`,
            data: f.picklist.slice(0, 2).map(v => esc(v.label || v.value)).join(', '),
            expected: 'Selected value is saved and displayed correctly',
          },
        ])
      ));
    }

    // Reference fields
    if (refFields.length > 0) {
      parts.push(testCase(
        tcId(tcNum++),
        'Verify that reference fields link correctly to related module records',
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'Medium',
        'At least one record exists in each referenced module.',
        refFields.slice(0, 3).flatMap(f => [
          {
            action: `Click the search/lookup icon for <strong>${esc(f.prompt || f.subCode)}</strong>`,
            data: '—',
            expected: 'Reference search dialog opens; related records are listed',
          },
          {
            action: 'Select a valid related record',
            data: '[Existing record from the related module]',
            expected: 'Selected record populates the reference field; linked record details display correctly',
          },
        ])
      ));
    }

    // Numeric fields
    if (numFields.length > 0) {
      parts.push(testCase(
        tcId(tcNum++),
        'Verify that numeric fields reject non-numeric input',
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'Low',
        'Open a record with numeric fields in edit mode.',
        numFields.slice(0, 2).flatMap(f => [
          {
            action: `Enter a valid number in <strong>${esc(f.prompt || f.subCode)}</strong>`,
            data: '42',
            expected: 'Value is accepted and saved',
          },
          {
            action: `Enter alphabetic text in <strong>${esc(f.prompt || f.subCode)}</strong>`,
            data: 'abc',
            expected: 'Input is blocked or validation error is shown',
          },
        ])
      ));
    }

    // Date fields
    if (dateFields.length > 0) {
      parts.push(testCase(
        tcId(tcNum++),
        'Verify that date fields accept valid dates and reject invalid formats',
        roles[0] ? (roles[0].name || roles[0].code) : 'Authorized User',
        'Low',
        'Open a record with date fields in edit mode.',
        dateFields.slice(0, 2).flatMap(f => [
          {
            action: `Enter a valid date in <strong>${esc(f.prompt || f.subCode)}</strong>`,
            data: '[Today\'s date in system format]',
            expected: 'Date is accepted and saved correctly',
          },
          {
            action: `Enter an invalid date string in <strong>${esc(f.prompt || f.subCode)}</strong>`,
            data: '99/99/9999',
            expected: 'Input is rejected or validation error shown',
          },
        ])
      ));
    }
  }

  // ── Sign-off Page ──────────────────────────────────────────────────────────
  parts.push(`<div class="pb"></div>`);
  parts.push(section('Test Execution Sign-Off', '', `
    <div class="ts-signoff">
      <p style="margin-bottom:16px;color:#475569;font-size:9pt;">
        Complete the summary below after all test cases have been executed. Attach this document to the project's UAT record or defect tracker.
      </p>
      <table class="ts-summary-table">
        <thead><tr><th>Metric</th><th>Count</th></tr></thead>
        <tbody>
          <tr><td>Total Test Cases</td><td></td></tr>
          <tr><td>Passed</td><td></td></tr>
          <tr><td>Failed</td><td></td></tr>
          <tr><td>Blocked</td><td></td></tr>
          <tr><td>Not Applicable</td><td></td></tr>
          <tr><td>Defects Logged</td><td></td></tr>
        </tbody>
      </table>
      <div class="ts-signoff-grid">
        <div class="ts-signoff-block">
          <div class="ts-signoff-label">Tester Signature</div>
          <div class="ts-signoff-line"></div>
          <div class="ts-signoff-sublabel">Name / Date</div>
        </div>
        <div class="ts-signoff-block">
          <div class="ts-signoff-label">Test Lead / Reviewer</div>
          <div class="ts-signoff-line"></div>
          <div class="ts-signoff-sublabel">Name / Date</div>
        </div>
        <div class="ts-signoff-block">
          <div class="ts-signoff-label">UAT Approval</div>
          <div class="ts-signoff-line"></div>
          <div class="ts-signoff-sublabel">Name / Date / Decision</div>
        </div>
      </div>
      <div class="ts-comments-box">
        <div class="ts-comments-label">Notes / Outstanding Issues</div>
      </div>
    </div>`));

  return parts.join('');
}

// ─── Test case builder ────────────────────────────────────────────────────────

function testCase(id, objective, role, priority, precondition, steps) {
  const PRIORITY_COLOR = { High: 'red', Medium: 'yellow', Low: 'green' };
  const color = PRIORITY_COLOR[priority] || 'gray';

  const stepRows = steps.map((s, i) => `
    <tr>
      <td class="ts-step-num">${i + 1}</td>
      <td class="ts-step-action">${s.action}</td>
      <td class="ts-step-data">${s.data}</td>
      <td class="ts-step-expected">${s.expected}</td>
      <td class="ts-step-actual"></td>
      <td class="ts-step-status">
        <div class="ts-status-check">☐ Pass<br>☐ Fail<br>☐ Blocked<br>☐ N/A</div>
      </td>
    </tr>`).join('');

  return `
<div class="ts-card">
  <div class="ts-card-header">
    <div class="ts-card-id">${esc(id)}</div>
    <div class="ts-card-obj">${objective}</div>
    <div class="ts-card-meta">
      ${badge(priority, color)}
      ${role ? `<span class="ts-role-badge">${esc(role)}</span>` : ''}
    </div>
  </div>
  <div class="ts-card-precond">
    <span class="ts-precond-label">Precondition:</span> ${precondition}
  </div>
  <table class="ts-steps-table">
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th style="width:28%">Action / Step</th>
        <th style="width:18%">Test Data</th>
        <th style="width:24%">Expected Result</th>
        <th style="width:18%">Actual Result</th>
        <th style="width:80px">Status</th>
      </tr>
    </thead>
    <tbody>${stepRows}</tbody>
  </table>
</div>`;
}

module.exports = { generateAllPDFs };
