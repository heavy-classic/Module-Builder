const xml2js = require('xml2js');
const AdmZip = require('adm-zip');

/**
 * Parse a DevonWay module export file (XML or ZIP containing XML).
 * Returns a normalized data object regardless of exact schema variations.
 */
async function parseModuleFile(buffer, filename) {
  let xmlBuffer;
  let xmlFilename = filename;

  const ext = filename.toLowerCase().split('.').pop();

  if (ext === 'zip') {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries().filter(e => !e.isDirectory);
    const xmlEntries = entries.filter(e => e.entryName.toLowerCase().endsWith('.xml'));
    if (xmlEntries.length === 0) throw new Error('No XML module definition found in the ZIP archive.');
    // Prefer the main module file over translation files
    const main = xmlEntries.find(e => !e.entryName.toLowerCase().includes('translat')) || xmlEntries[0];
    xmlBuffer = main.getData();
    xmlFilename = main.entryName.split('/').pop();
  } else if (ext === 'xml') {
    xmlBuffer = buffer;
  } else {
    throw new Error('Unsupported file type. Please upload an .xml or .zip module export.');
  }

  const xmlString = xmlBuffer.toString('utf8');

  let parsed;
  try {
    parsed = await xml2js.parseStringPromise(xmlString, {
      explicitArray: true,
      mergeAttrs: false,
      trim: true,
      normalize: true,
      tagNameProcessors: [],
    });
  } catch (e) {
    throw new Error(`XML parse error: ${e.message}`);
  }

  return buildModuleData(parsed, xmlString, xmlFilename);
}

// ─── XML navigation helpers ──────────────────────────────────────────────────

/** Get the root element from xml2js output (handles single-root XML) */
function root(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const keys = Object.keys(parsed).filter(k => k !== '$');
  if (keys.length === 0) return null;
  const val = parsed[keys[0]];
  return Array.isArray(val) ? val[0] : val;
}

/** Find a child by trying multiple key names (case-insensitive) */
function find(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key];
    const match = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    if (match !== undefined) return obj[match];
  }
  return undefined;
}

/** Get scalar string from xml2js value (unwraps arrays, text nodes) */
function str(val) {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return str(val[0]);
  if (typeof val === 'object') {
    if (val._ !== undefined) return String(val._);
    return '';
  }
  return String(val).trim();
}

/** Get attributes object from xml2js element */
function attrs(el) {
  if (!el || typeof el !== 'object') return {};
  return el.$ || {};
}

/** Get all elements from a parent, trying multiple key names */
function children(parent, ...keys) {
  if (!parent) return [];
  for (const key of keys) {
    const val = find(parent, key);
    if (val !== undefined) {
      const arr = Array.isArray(val) ? val : [val];
      return arr.flat().filter(Boolean);
    }
  }
  return [];
}

/** Get nested children: find parent element, then its children */
function nested(obj, parentKey, childKey) {
  const parentVal = find(obj, parentKey);
  if (!parentVal) return [];
  const parent = Array.isArray(parentVal) ? parentVal[0] : parentVal;
  return children(parent, childKey);
}

/** Get attrs + scalar fallback for a property */
function prop(el, attrName, ...elementNames) {
  const a = attrs(el);
  const fromAttr = a[attrName] || a[attrName.toLowerCase()] || a[attrName.toUpperCase()];
  if (fromAttr !== undefined) return String(fromAttr);
  for (const name of elementNames) {
    const val = find(el, name);
    if (val !== undefined) return str(val);
  }
  return '';
}

function parseBool(val) {
  if (val === undefined || val === null || val === '') return false;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

// ─── Field type lookup ────────────────────────────────────────────────────────

const FIELD_TYPE_NAMES = {
  BU: 'Button', CL: 'Character (Large)', CS: 'Character (Small)',
  CB: 'Checkbox', D: 'Date', N: 'Numeric', P: 'Picklist',
  R: 'Reference', T: 'Time', VC: 'Virtual (Character)', VD: 'Virtual (Date)',
  VH: 'Virtual (HTML)', VN: 'Virtual (Numeric)', VP: 'Virtual (Picklist)',
  VR: 'Virtual (Reference)', CR: 'Chart/Report', GF: 'Graphic',
};

function typeName(code) {
  return FIELD_TYPE_NAMES[code?.toUpperCase()] || code || 'Unknown';
}

// ─── Data extraction ──────────────────────────────────────────────────────────

function buildModuleData(parsed, rawXml, filename) {
  const r = root(parsed);

  const data = {
    filename,
    rawXml,
    metadata: extractMetadata(r, filename),
    levels: extractLevels(r),
    fields: extractFields(r),
    workflow: extractWorkflow(r),
    rules: extractRules(r),
    regions: extractRegions(r),
    roles: extractRoles(r),
    functions: extractFunctions(r),
    moduleBehaviors: extractModuleBehaviors(r),
    developerNotes: extractDeveloperNotes(r),
  };

  data.statistics = computeStats(data);
  return data;
}

function extractMetadata(r, filename) {
  if (!r) return { name: filename.replace(/\.(xml|zip)$/i, ''), prefix: '', category: '', moduleType: 'Non-Public, Workflow-Enabled', publicFlag: false, workflowFlag: true, description: '' };

  const a = attrs(r);

  const name = prop(r, 'Name', 'ModuleName', 'name') ||
    prop(r, 'Title', 'title') ||
    filename.replace(/\.(xml|zip)$/i, '') ||
    'Unknown Module';

  const prefix = prop(r, 'Prefix', 'Code', 'prefix', 'code', 'Abbr') || '';
  const category = prop(r, 'Category', 'Group', 'category', 'group') || '';
  const version = prop(r, 'Version', 'version', 'ReleaseVersion') || '';
  const description = str(find(r, 'Description', 'Summary', 'description')) || '';
  const devNotes = extractDeveloperNotes(r);

  const isPublicRaw = prop(r, 'PublicData', 'IsPublic', 'Public', 'public', 'IsPublicData');
  const isWFRaw = prop(r, 'WorkflowEnabled', 'IsWorkflow', 'HasWorkflow', 'Workflow');

  const publicFlag = parseBool(isPublicRaw);
  const workflowFlag = isWFRaw !== '' ? parseBool(isWFRaw) : true; // default to true if not specified

  let moduleType;
  if (publicFlag && workflowFlag) moduleType = 'Public, Workflow-Enabled';
  else if (publicFlag) moduleType = 'Public, Non-Workflow';
  else if (workflowFlag) moduleType = 'Non-Public, Workflow-Enabled';
  else moduleType = 'Non-Public, Non-Workflow';

  return { name, prefix, category, moduleType, publicFlag, workflowFlag, version, description };
}

function extractLevels(r) {
  if (!r) return [];
  let els = nested(r, 'Levels', 'Level');
  if (els.length === 0) els = children(r, 'Level', 'level');

  return els.map(el => {
    const a = attrs(el);
    const code = prop(el, 'Code', 'code', 'Id') || str(el) || '';
    const name = prop(el, 'Name', 'name', 'Title') || '';
    return {
      code,
      name,
      isHeader: code.toUpperCase() === 'H' || name.toLowerCase().includes('header'),
      order: parseInt(prop(el, 'Order', 'order') || '0') || 0,
    };
  });
}

function extractFields(r) {
  if (!r) return [];
  let els = nested(r, 'Fields', 'Field');
  if (els.length === 0) els = children(r, 'Field', 'field');

  return els.map(el => {
    const a = attrs(el);
    const code = prop(el, 'Code', 'FieldCode', 'code', 'Id') || '';
    const rawType = prop(el, 'Type', 'FieldType', 'type', 'DataType') || '';

    // Infer type from field code pattern like H:CS1 → CS
    const codeTypeMatch = code.match(/:([A-Z]+)\d+$/i);
    const type = rawType || (codeTypeMatch ? codeTypeMatch[1].toUpperCase() : '');

    // Infer level from code (H: = header, C1: = child 1, etc.)
    const levelMatch = code.match(/^([HC]\d*)/i);
    const level = levelMatch ? levelMatch[1].toUpperCase() : (code ? 'H' : '?');

    return {
      code,
      type,
      typeFull: typeName(type),
      prompt: prop(el, 'Prompt', 'Label', 'prompt', 'DisplayName', 'Caption') || '',
      name: prop(el, 'Name', 'name', 'FieldName') || '',
      level,
      isHeader: level === 'H',
      order: parseInt(prop(el, 'Order', 'order', 'DisplayOrder') || '0') || 0,
      identifying: parseBool(prop(el, 'IdentifyingField', 'Identifying', 'IsIdentifying', 'Identifier')),
      searchIndexed: parseBool(prop(el, 'SearchIndexed', 'Indexed', 'IsSearchIndexed')),
      searchFilter: parseBool(prop(el, 'SearchFilter', 'IsSearchFilter')),
      searchBoost: prop(el, 'SearchBoost', 'Boost') || '',
      trackHistory: parseBool(prop(el, 'TrackHistory', 'HistoryTracked', 'IsHistoryTracked')),
      required: parseBool(prop(el, 'Required', 'IsRequired', 'Mandatory')),
      calculationOrder: prop(el, 'CalculationOrder', 'CalcOrder', 'CalcSequence') || '',
      calculationLoops: prop(el, 'CalculationLoops', 'CalcLoops') || '',
      length: prop(el, 'Length', 'MaxLength', 'MaxChars') || '',
      height: prop(el, 'Height', 'DisplayHeight') || '',
      helpText: str(find(el, 'HelpText', 'Help', 'ToolTip', 'Tooltip', 'helpText')) || '',
      region: prop(el, 'Region', 'RegionCode', 'RegionName') || '',
      regionMiramar: prop(el, 'RegionMiramar', 'MiramarRegion') || '',
      gridWidth: prop(el, 'GridWidth', 'ColumnWidth') || '',
      printRegion: prop(el, 'PrintRegion', 'PrintGroup') || '',
      printWidth: prop(el, 'PrintWidth', 'Width') || '',
      commonField: prop(el, 'CommonField', 'CommonFieldCode') || '',
      displayFormat: prop(el, 'DisplayFormat', 'Format', 'Mask') || '',
      allowOverflow: parseBool(prop(el, 'AllowOverflowText', 'OverflowText', 'AllowOverflow')),
      hiddenFromRest: parseBool(prop(el, 'HiddenData', 'HiddenFromREST', 'RestHidden')),
      refreshOnChange: parseBool(prop(el, 'RefreshOnChange', 'RefreshOnUpdate')),
      calculation: str(find(el, 'Calculation', 'Formula', 'Expression', 'DXL', 'CalcExpression')) || '',
      referenceModules: extractRefModules(el),
      picklist: extractPicklist(el),
      behaviors: extractFieldBehaviors(el),
    };
  });
}

function extractRefModules(el) {
  let mods = nested(el, 'ReferenceModules', 'Module');
  if (mods.length === 0) mods = nested(el, 'ReferencedModules', 'Module');
  if (mods.length === 0) mods = nested(el, 'Modules', 'Module');
  return mods.map(m => {
    const a = attrs(m);
    return { code: a.Code || a.code || str(m) || '', name: a.Name || a.name || '' };
  }).filter(m => m.code);
}

function extractPicklist(el) {
  let items = nested(el, 'PicklistValues', 'Value');
  if (items.length === 0) items = nested(el, 'Values', 'Value');
  if (items.length === 0) items = nested(el, 'Items', 'Item');
  return items.map(v => {
    const a = attrs(v);
    return {
      value: a.Value || a.value || str(v) || '',
      label: a.Label || a.label || a.Display || '',
      factor: a.Factor || a.factor || '',
    };
  });
}

function extractFieldBehaviors(el) {
  let els = nested(el, 'Behaviors', 'Behavior');
  if (els.length === 0) els = children(el, 'Behavior', 'behavior');
  return els.map(b => {
    const a = attrs(b);
    return {
      type: prop(b, 'Type', 'Behavior', 'BehaviorType', 'type') || '',
      condition: str(find(b, 'Condition', 'Rule', 'DXL', 'Expression', 'When')) || '',
      value: prop(b, 'Value', 'Setting', 'Color', 'Text') || '',
    };
  });
}

function extractWorkflow(r) {
  if (!r) return { tasks: [], enabled: false };
  const wfEl = find(r, 'Workflow', 'WorkflowConfig', 'Tasks');
  if (!wfEl) return { tasks: [], enabled: true };
  const wf = Array.isArray(wfEl) ? wfEl[0] : wfEl;

  let taskEls = nested(wf, 'Tasks', 'Task');
  if (taskEls.length === 0) taskEls = children(wf, 'Task', 'task', 'Step');
  // If the found element was "Tasks" directly, look for Task inside
  if (taskEls.length === 0 && wfEl) {
    taskEls = children(wf, 'Task', 'task');
  }

  const tasks = taskEls.map(t => {
    const a = attrs(t);
    return {
      code: prop(t, 'Code', 'code', 'Id', 'StepCode') || '',
      name: prop(t, 'Name', 'name', 'Title', 'StepName') || '',
      order: parseInt(prop(t, 'Order', 'Sequence', 'order') || '0') || 0,
      description: str(find(t, 'Description', 'description')) || '',
      skipCondition: str(find(t, 'SkipCondition', 'SkipRule', 'Skip', 'SkipWhen')) || '',
      completionRule: str(find(t, 'CompletionRule', 'Completion', 'CompleteWhen')) || '',
      assignments: extractAssignments(t),
      rules: extractTaskRules(t),
    };
  }).sort((a, b) => a.order - b.order);

  const a = attrs(wf);
  return {
    tasks,
    enabled: parseBool(prop(wf, 'Enabled', 'enabled') || 'true'),
    reopenEnabled: parseBool(prop(wf, 'ReopenEnabled', 'AllowReopen')),
    rollbackEnabled: parseBool(prop(wf, 'RollbackEnabled', 'AllowRollback')),
  };
}

function extractAssignments(taskEl) {
  let els = nested(taskEl, 'Assignments', 'Assignment');
  if (els.length === 0) els = children(taskEl, 'Assignment', 'Assignee');
  return els.map(el => ({
    type: prop(el, 'Type', 'AssignmentType', 'type') || '',
    value: prop(el, 'Value', 'Name', 'Role', 'User', 'Team') || str(el) || '',
    condition: str(find(el, 'Condition', 'Rule', 'When')) || '',
  }));
}

function extractTaskRules(taskEl) {
  let els = nested(taskEl, 'Rules', 'Rule');
  if (els.length === 0) els = children(taskEl, 'Rule', 'rule');
  return els.map(el => ({
    type: prop(el, 'Type', 'RuleType', 'type') || '',
    expression: str(find(el, 'Expression', 'DXL', 'Condition', 'Rule')) || '',
    value: prop(el, 'Value', 'Setting') || '',
  }));
}

function extractRules(r) {
  if (!r) return [];
  let els = nested(r, 'Rules', 'Rule');
  if (els.length === 0) els = children(r, 'Rule', 'rule');
  // Also look in FieldBehaviors section
  const fbEls = nested(r, 'FieldBehaviors', 'FieldBehavior');

  return [...els, ...fbEls].map(el => ({
    target: prop(el, 'Target', 'Field', 'FieldCode', 'target') || '',
    behavior: prop(el, 'Behavior', 'BehaviorType', 'Type', 'Action', 'behavior') || '',
    condition: str(find(el, 'Condition', 'Expression', 'DXL', 'Rule', 'When', 'If')) || '',
    value: prop(el, 'Value', 'Setting', 'Color', 'Text', 'To') || '',
    name: prop(el, 'Name', 'name', 'Description') || '',
    order: parseInt(prop(el, 'Order', 'Sequence') || '0') || 0,
  }));
}

function extractRegions(r) {
  if (!r) return [];
  let els = nested(r, 'Regions', 'Region');
  if (els.length === 0) els = nested(r, 'Layout', 'Region');
  if (els.length === 0) els = children(r, 'Region', 'region');

  return els.map(el => ({
    name: prop(el, 'Name', 'name', 'Title') || '',
    style: prop(el, 'Style', 'RegionStyle', 'Type', 'DisplayType') || '',
    order: parseInt(prop(el, 'Order', 'Sequence', 'order') || '0') || 0,
    tab: prop(el, 'Tab', 'TabName', 'TabGroup') || '',
    layout: prop(el, 'Layout', 'LayoutType') || '',
    fields: extractRegionFields(el),
  })).sort((a, b) => a.order - b.order);
}

function extractRegionFields(regionEl) {
  let els = nested(regionEl, 'Fields', 'Field');
  if (els.length === 0) els = children(regionEl, 'Field', 'FieldRef');
  return els.map(el => {
    const a = attrs(el);
    return a.Code || a.code || a.FieldCode || str(el) || '';
  }).filter(Boolean);
}

function extractRoles(r) {
  if (!r) return [];
  let els = nested(r, 'Roles', 'Role');
  if (els.length === 0) els = children(r, 'Role', 'role');

  return els.map(el => ({
    name: prop(el, 'Name', 'name', 'RoleName') || '',
    code: prop(el, 'Code', 'code', 'RoleCode') || '',
    description: str(find(el, 'Description', 'description')) || '',
    isWorkflowRole: parseBool(prop(el, 'IsWorkflow', 'WorkflowRole', 'IsTaskRole')),
    permissions: extractRolePermissions(el),
  }));
}

function extractRolePermissions(roleEl) {
  let els = nested(roleEl, 'Properties', 'Property');
  if (els.length === 0) els = nested(roleEl, 'Permissions', 'Permission');
  if (els.length === 0) els = nested(roleEl, 'Fields', 'Field');
  return els.map(el => ({
    field: prop(el, 'Field', 'FieldCode', 'Code') || '',
    canView: parseBool(prop(el, 'CanView', 'View', 'Read', 'Visible')),
    canEdit: parseBool(prop(el, 'CanEdit', 'Edit', 'Write', 'Editable')),
    canCreate: parseBool(prop(el, 'CanCreate', 'Create')),
  }));
}

function extractFunctions(r) {
  if (!r) return [];
  let els = nested(r, 'Functions', 'Function');
  if (els.length === 0) els = children(r, 'Function', 'function');

  return els.map(el => ({
    name: prop(el, 'Name', 'name', 'FunctionName') || '',
    code: prop(el, 'Code', 'code') || '',
    description: str(find(el, 'Description', 'description', 'Summary')) || '',
    body: str(find(el, 'Body', 'DXL', 'Expression', 'Code', 'Script', 'Implementation')) || '',
    parameters: extractFunctionParams(el),
    returnType: prop(el, 'ReturnType', 'Returns', 'Type') || '',
  }));
}

function extractFunctionParams(el) {
  let els = nested(el, 'Parameters', 'Parameter');
  if (els.length === 0) els = children(el, 'Parameter', 'Param', 'Argument');
  return els.map(p => ({
    name: prop(p, 'Name', 'name') || str(p) || '',
    type: prop(p, 'Type', 'DataType') || '',
  }));
}

function extractModuleBehaviors(r) {
  if (!r) return [];
  const mbEl = find(r, 'ModuleBehaviors', 'Behaviors', 'ModuleSettings', 'Settings');
  if (!mbEl) return [];
  const mb = Array.isArray(mbEl) ? mbEl[0] : mbEl;

  const types = ['Email', 'BatchRule', 'WebService', 'Schedule', 'Behavior', 'DirtyCriteria'];
  const els = types.flatMap(t => children(mb, t, t.toLowerCase()));

  return els.map(el => ({
    type: prop(el, 'Type', 'BehaviorType') || 'Behavior',
    name: prop(el, 'Name', 'name') || '',
    condition: str(find(el, 'Condition', 'Rule', 'When')) || '',
    description: str(find(el, 'Description', 'description')) || '',
  }));
}

function extractDeveloperNotes(r) {
  if (!r) return '';
  return str(find(r, 'DeveloperNotes', 'Notes', 'DevNotes', 'developerNotes', 'note')) || '';
}

function computeStats(data) {
  const fieldsByType = {};
  const fieldsByLevel = {};
  const levelSet = new Set();

  for (const f of data.fields) {
    fieldsByType[f.type] = (fieldsByType[f.type] || 0) + 1;
    fieldsByLevel[f.level] = (fieldsByLevel[f.level] || 0) + 1;
    levelSet.add(f.level);
  }

  // Merge with declared levels
  data.levels.forEach(l => levelSet.add(l.code));

  return {
    totalFields: data.fields.length,
    fieldsByType,
    fieldsByLevel,
    totalLevels: levelSet.size || data.levels.length,
    totalWorkflowTasks: data.workflow.tasks.length,
    totalRules: data.rules.length,
    totalRoles: data.roles.length,
    totalRegions: data.regions.length,
    totalFunctions: data.functions.length,
    identifyingFields: data.fields.filter(f => f.identifying).length,
    searchIndexedFields: data.fields.filter(f => f.searchIndexed).length,
    trackedFields: data.fields.filter(f => f.trackHistory).length,
    requiredFields: data.fields.filter(f => f.required).length,
    calculatedFields: data.fields.filter(f => f.type.startsWith('V') || f.calculation).length,
    referenceFields: data.fields.filter(f => f.type === 'R').length,
  };
}

module.exports = { parseModuleFile };
