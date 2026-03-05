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
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
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
      ${statCard(s.totalFunctions, 'Functions')}
    </div>`));

  // Properties
  const propRows = [
    ['Module Name', m.name],
    ['Prefix', m.prefix || '—'],
    ['Category', m.category || '—'],
    ['Module Type', m.moduleType],
    ['Workflow Enabled', m.workflowFlag ? 'Yes' : 'No'],
    ['Public Data', m.publicFlag ? 'Yes' : 'No'],
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
      if (f.required) badges.push(badge('Required', 'red'));
      if (f.searchIndexed) badges.push(badge('Indexed', 'green'));
      if (f.trackHistory) badges.push(badge('Tracked', 'yellow'));
      if (f.allowOverflow) badges.push(badge('Overflow', 'blue'));

      const details = [];
      if (f.length) details.push(`Max: ${f.length} chars`);
      if (f.height) details.push(`Height: ${f.height} lines`);
      if (f.calculationOrder) details.push(`Calc order: ${f.calculationOrder}`);
      if (f.commonField) details.push(`Common: ${f.commonField}`);
      if (f.displayFormat) details.push(`Format: ${f.displayFormat}`);
      if (f.region) details.push(`Region: ${f.region}`);
      if (f.referenceModules.length > 0) details.push(`Refs: ${f.referenceModules.map(m => m.code).join(', ')}`);
      if (f.picklist.length > 0) details.push(`${f.picklist.length} values`);

      return `<tr>
        <td><span class="code">${esc(f.code)}</span></td>
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
    const detailFields = levelFields.filter(f =>
      f.helpText || f.calculation || f.behaviors.length > 0 || f.picklist.length > 0
    );

    if (detailFields.length > 0) {
      const cards = detailFields.map(f => {
        const items = [];
        if (f.helpText) items.push(`<div class="detail-row"><span class="detail-label">Help Text</span><span>${esc(f.helpText)}</span></div>`);
        if (f.calculation) items.push(`<div class="detail-row"><span class="detail-label">Calculation</span><div class="code-block">${esc(f.calculation)}</div></div>`);
        if (f.picklist.length > 0) {
          const pvs = f.picklist.map(v => `<span class="pv">${esc(v.label || v.value)}${v.factor ? ` <em>(${v.factor})</em>` : ''}</span>`).join('');
          items.push(`<div class="detail-row"><span class="detail-label">Values</span><div class="pv-list">${pvs}</div></div>`);
        }
        if (f.behaviors.length > 0) {
          const bRows = f.behaviors.map(b => `
            <tr>
              <td>${esc(b.type)}</td>
              <td>${b.value ? esc(b.value) : '—'}</td>
              <td class="dxl">${b.condition ? `<div class="code-block">${esc(b.condition)}</div>` : '—'}</td>
            </tr>`).join('');
          items.push(`<div class="detail-row"><span class="detail-label">Behaviors</span>
            <table class="behavior-table">
              <thead><tr><th>Behavior</th><th>Value</th><th>Condition (DXL)</th></tr></thead>
              <tbody>${bRows}</tbody>
            </table></div>`);
        }
        return `<div class="detail-card">
          <div class="detail-header"><span class="code">${esc(f.code)}</span> <span class="detail-prompt">${esc(f.prompt || f.name || '')}</span></div>
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

  if (!workflow.tasks || workflow.tasks.length === 0) {
    return emptyState('No Workflow Configured', m.workflowFlag
      ? 'Workflow is enabled but no tasks were found in this export.'
      : 'This module does not use workflow. It is a non-workflow data module.');
  }

  // Visual flow diagram
  const flowSteps = workflow.tasks.map((t, i) =>
    `<div class="wf-step">${esc(t.name || t.code || `Task ${i+1}`)}</div>${i < workflow.tasks.length - 1 ? '<div class="wf-arrow">→</div>' : ''}`
  ).join('');

  parts.push(section('Process Flow', `${workflow.tasks.length} tasks`, `
    <div class="wf-flow">${flowSteps}</div>`));

  // Workflow settings
  const settings = [
    ['Workflow Enabled', workflow.enabled !== false ? 'Yes' : 'No'],
    ['Reopen Allowed', workflow.reopenEnabled ? 'Yes' : 'No'],
    ['Rollback Allowed', workflow.rollbackEnabled ? 'Yes' : 'No'],
  ];
  parts.push(section('Workflow Settings', '', `
    <table>
      <tbody>${settings.map(([k, v]) => `<tr><td class="prop-key">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody>
    </table>`));

  // Task detail cards
  parts.push(`<div class="section-title-only">Task Definitions</div>`);

  for (const [i, task] of workflow.tasks.entries()) {
    const hasContent = task.assignments.length > 0 || task.skipCondition || task.completionRule || task.rules.length > 0 || task.description;

    let taskContent = '';
    if (task.description) taskContent += `<div class="task-desc">${esc(task.description)}</div>`;

    if (task.assignments.length > 0) {
      const rows = task.assignments.map(a => `<tr>
        <td>${esc(a.type || 'Role')}</td>
        <td>${esc(a.value || '—')}</td>
        <td>${a.condition ? `<div class="code-block">${esc(a.condition)}</div>` : '—'}</td>
      </tr>`).join('');
      taskContent += `
        <div class="task-section-label">Assignments</div>
        <table>
          <thead><tr><th>Type</th><th>Value</th><th>Condition (DXL)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    if (task.skipCondition) {
      taskContent += `<div class="task-section-label">Skip Condition</div><div class="code-block">${esc(task.skipCondition)}</div>`;
    }

    if (task.completionRule) {
      taskContent += `<div class="task-section-label">Completion Rule</div><div class="code-block">${esc(task.completionRule)}</div>`;
    }

    if (task.rules.length > 0) {
      const rows = task.rules.map(r => `<tr>
        <td>${esc(r.type)}</td>
        <td>${r.expression ? `<div class="code-block">${esc(r.expression)}</div>` : '—'}</td>
        <td>${esc(r.value || '—')}</td>
      </tr>`).join('');
      taskContent += `
        <div class="task-section-label">Task Rules</div>
        <table>
          <thead><tr><th>Type</th><th>Expression (DXL)</th><th>Value</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    parts.push(`
      <div class="task-card">
        <div class="task-header">
          <div class="task-num">${i + 1}</div>
          <div class="task-info">
            <div class="task-name">${esc(task.name || task.code || `Task ${i + 1}`)}</div>
            ${task.code ? `<div class="task-code">Code: ${esc(task.code)}</div>` : ''}
          </div>
        </div>
        ${hasContent ? `<div class="task-body">${taskContent}</div>` : '<div class="task-body muted">No additional details in export.</div>'}
      </div>`);
  }

  return parts.join('');
}

function buildRules(data) {
  const { rules, fields, functions } = data;
  const parts = [];

  // Field-level behaviors (from rules array)
  if (rules.length > 0) {
    // Group by behavior type
    const byBehavior = {};
    for (const r of rules) {
      const key = r.behavior || 'General';
      if (!byBehavior[key]) byBehavior[key] = [];
      byBehavior[key].push(r);
    }

    parts.push(section('Field Rules & Behaviors', `${rules.length} rules`, ''));

    for (const [behavior, ruleSet] of Object.entries(byBehavior)) {
      const rows = ruleSet.map(r => `<tr>
        <td><span class="code">${esc(r.target || '—')}</span></td>
        <td>${esc(r.name || '—')}</td>
        <td>${r.value ? esc(r.value) : '—'}</td>
        <td>${r.condition ? `<div class="code-block">${esc(r.condition)}</div>` : '—'}</td>
      </tr>`).join('');

      parts.push(`
        <div class="subsection">
          <div class="subsection-title">${esc(behavior)}</div>
          <table>
            <thead><tr><th>Target Field</th><th>Rule Name</th><th>Value</th><th>Condition (DXL)</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`);
    }
  }

  // Inline field behaviors (from field definitions)
  const fieldsWithBehaviors = fields.filter(f => f.behaviors.length > 0);
  if (fieldsWithBehaviors.length > 0 && rules.length === 0) {
    parts.push(section('Field Behaviors', `${fieldsWithBehaviors.length} fields with behaviors`, ''));
    for (const f of fieldsWithBehaviors) {
      const rows = f.behaviors.map(b => `<tr>
        <td>${esc(b.type)}</td>
        <td>${b.value ? esc(b.value) : '—'}</td>
        <td>${b.condition ? `<div class="code-block">${esc(b.condition)}</div>` : '—'}</td>
      </tr>`).join('');
      parts.push(`
        <div class="subsection">
          <div class="subsection-title"><span class="code">${esc(f.code)}</span> — ${esc(f.prompt || f.name || '')}</div>
          <table>
            <thead><tr><th>Behavior</th><th>Value</th><th>Condition (DXL)</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`);
    }
  }

  // Calculations
  const calcs = fields.filter(f => f.calculation);
  if (calcs.length > 0) {
    parts.push(section('Field Calculations', `${calcs.length} calculated fields`, ''));
    for (const f of calcs) {
      parts.push(`
        <div class="calc-block">
          <div class="calc-header">
            <span class="code">${esc(f.code)}</span>
            <span class="calc-prompt">${esc(f.prompt || f.name || '')}</span>
            ${f.calculationOrder ? `<span class="badge badge-blue">Order: ${esc(f.calculationOrder)}</span>` : ''}
            ${f.calculationLoops ? `<span class="badge badge-yellow">Loops: ${esc(f.calculationLoops)}</span>` : ''}
          </div>
          <div class="code-block">${esc(f.calculation)}</div>
        </div>`);
    }
  }

  // Functions
  if (functions.length > 0) {
    parts.push(section('Module Functions', `${functions.length} functions`, ''));
    for (const fn of functions) {
      const params = fn.parameters.length > 0
        ? fn.parameters.map(p => `${esc(p.name)}${p.type ? `: ${esc(p.type)}` : ''}`).join(', ')
        : 'none';
      parts.push(`
        <div class="func-card">
          <div class="func-header">
            <span class="func-name">${esc(fn.name || fn.code)}</span>
            <span class="func-sig">(${params})</span>
            ${fn.returnType ? `<span class="badge badge-blue">→ ${esc(fn.returnType)}</span>` : ''}
          </div>
          ${fn.description ? `<div class="func-desc">${esc(fn.description)}</div>` : ''}
          ${fn.body ? `<div class="code-block">${esc(fn.body)}</div>` : ''}
        </div>`);
    }
  }

  if (rules.length === 0 && fieldsWithBehaviors.length === 0 && calcs.length === 0 && functions.length === 0) {
    return emptyState('No Rules or Behaviors Found', 'No rules, behaviors, or calculations were found in this module export.');
  }

  return parts.join('');
}

function buildLayout(data) {
  const { regions, fields } = data;
  const parts = [];

  if (regions.length === 0 && fields.every(f => !f.region)) {
    return emptyState('No Layout Data Found', 'No region or layout definitions were found in this module export.');
  }

  // Declared regions
  if (regions.length > 0) {
    const rows = regions.map(r => `<tr>
      <td>${esc(r.name || '—')}</td>
      <td>${esc(r.style || '—')}</td>
      <td>${esc(r.tab || '—')}</td>
      <td>${r.fields.length > 0 ? r.fields.map(f => `<span class="code">${esc(f)}</span>`).join(' ') : '—'}</td>
    </tr>`).join('');

    parts.push(section('Screen Regions', `${regions.length} regions`, `
      <table>
        <thead><tr><th>Region Name</th><th>Style</th><th>Tab Group</th><th>Fields</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`));
  }

  // Fields grouped by region (from field properties)
  const fieldsWithRegion = fields.filter(f => f.region || f.regionMiramar);
  if (fieldsWithRegion.length > 0) {
    const byRegion = {};
    for (const f of fieldsWithRegion) {
      const key = f.region || f.regionMiramar || 'Default';
      if (!byRegion[key]) byRegion[key] = [];
      byRegion[key].push(f);
    }

    parts.push(section('Field Region Assignments', '', ''));
    for (const [regionName, regionFields] of Object.entries(byRegion)) {
      const rows = regionFields
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
        .map(f => `<tr>
          <td><span class="code">${esc(f.code)}</span></td>
          <td>${esc(f.prompt || f.name || '—')}</td>
          <td>${esc(f.typeFull || f.type)}</td>
          <td>${f.order || '—'}</td>
          ${f.regionMiramar ? `<td>${esc(f.regionMiramar)}</td>` : ''}
          ${f.printRegion ? `<td>${esc(f.printRegion)}</td>` : ''}
        </tr>`).join('');

      const hasMiramar = regionFields.some(f => f.regionMiramar);
      const hasPrint = regionFields.some(f => f.printRegion);

      parts.push(`
        <div class="subsection">
          <div class="subsection-title">${esc(regionName)}</div>
          <table>
            <thead><tr><th>Field Code</th><th>Prompt</th><th>Type</th><th>Order</th>${hasMiramar ? '<th>Miramar Region</th>' : ''}${hasPrint ? '<th>Print Region</th>' : ''}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`);
    }
  }

  // Fields without region (unassigned)
  const unassigned = fields.filter(f => !f.region && !f.regionMiramar);
  if (unassigned.length > 0 && regions.length === 0) {
    // Show all fields in a simple layout table
    parts.push(section('All Fields (No Region Data)', `${fields.length} fields`, `
      <table>
        <thead><tr><th>Field Code</th><th>Prompt</th><th>Level</th><th>Type</th><th>Order</th></tr></thead>
        <tbody>${fields.map(f => `<tr>
          <td><span class="code">${esc(f.code)}</span></td>
          <td>${esc(f.prompt || f.name || '—')}</td>
          <td>${esc(f.level)}</td>
          <td>${esc(f.typeFull || f.type)}</td>
          <td>${f.order || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`));
  }

  return parts.join('');
}

function buildSecurity(data) {
  const { roles, fields, metadata: m } = data;
  const parts = [];

  if (roles.length === 0) {
    return emptyState('No Role Definitions Found', 'No role or security configurations were found in this module export.');
  }

  // Role summary
  parts.push(section('Roles', `${roles.length} roles defined`, `
    <table>
      <thead><tr><th>Role Name</th><th>Code</th><th>Workflow Role</th><th>Description</th><th>Permissions</th></tr></thead>
      <tbody>${roles.map(r => `<tr>
        <td><strong>${esc(r.name || '—')}</strong></td>
        <td><span class="code">${esc(r.code || '—')}</span></td>
        <td>${r.isWorkflowRole ? badge('Yes', 'green') : badge('No', 'gray')}</td>
        <td>${esc(r.description || '—')}</td>
        <td>${r.permissions.length} configured</td>
      </tr>`).join('')}</tbody>
    </table>`));

  // Role permission details
  for (const role of roles) {
    if (role.permissions.length === 0) continue;
    const rows = role.permissions.map(p => `<tr>
      <td><span class="code">${esc(p.field || '—')}</span></td>
      <td>${p.canView ? badge('✓', 'green') : badge('✗', 'gray')}</td>
      <td>${p.canEdit ? badge('✓', 'green') : badge('✗', 'gray')}</td>
      <td>${p.canCreate ? badge('✓', 'green') : badge('✗', 'gray')}</td>
    </tr>`).join('');

    parts.push(`
      <div class="subsection">
        <div class="subsection-title">${esc(role.name)} Permissions</div>
        <table>
          <thead><tr><th>Field</th><th>View</th><th>Edit</th><th>Create</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  }

  // Field-level restrictions from field properties
  const restricted = fields.filter(f => f.hiddenFromRest || f.required);
  if (restricted.length > 0) {
    parts.push(section('Field-Level Restrictions', '', `
      <table>
        <thead><tr><th>Field Code</th><th>Prompt</th><th>Type</th><th>REST Hidden</th><th>Required</th></tr></thead>
        <tbody>${restricted.map(f => `<tr>
          <td><span class="code">${esc(f.code)}</span></td>
          <td>${esc(f.prompt || f.name || '—')}</td>
          <td>${esc(f.type)}</td>
          <td>${f.hiddenFromRest ? badge('Yes', 'red') : '—'}</td>
          <td>${f.required ? badge('Yes', 'yellow') : '—'}</td>
        </tr>`).join('')}</tbody>
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
`;
}

module.exports = { generateAllPDFs };
