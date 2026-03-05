const xml2js = require('xml2js');
const AdmZip = require('adm-zip');

/**
 * Parse a DevonWay module export file (XML or ZIP containing XML).
 * Returns a normalized data object based on the actual SubscriberModule XML schema.
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
    });
  } catch (e) {
    throw new Error(`XML parse error: ${e.message}`);
  }

  return buildModuleData(parsed, xmlString, xmlFilename);
}

// ─── XML navigation helpers ──────────────────────────────────────────────────

/** Get the root element content from xml2js output */
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

/** Get all elements from a parent with the given key name */
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
  RG: 'Region/Grid', BY: 'Created By', ON: 'Created On',
};

function typeName(code) {
  return FIELD_TYPE_NAMES[code?.toUpperCase()] || code || 'Unknown';
}

// ─── Rule target type lookup ──────────────────────────────────────────────────

const TARGET_TYPE_NAMES = {
  IN: 'Invisible', NM: 'Non-Modifiable', RQ: 'Required',
  DFT: 'Default Value', GR: 'Grid', BL: 'Bold', IT: 'Italics',
  BC: 'Background Color', TC: 'Text Color', PR: 'Prompt',
  RE: 'Region', FS: 'Font Size', EV: 'Empty Value Text',
  FMT: 'Format', DS: 'Display Type',
};

function targetTypeName(code) {
  return TARGET_TYPE_NAMES[code?.toUpperCase()] || code || 'Unknown';
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
    functions: [],
    moduleBehaviors: [],
    developerNotes: '',
  };

  data.statistics = computeStats(data);
  return data;
}

function extractMetadata(r, filename) {
  const fallback = {
    name: filename.replace(/\.(xml|zip)$/i, ''),
    moduleCode: '', prefix: '', category: '',
    moduleType: 'Non-Public, Workflow-Enabled',
    publicFlag: false, workflowFlag: true, version: '', description: '',
  };
  if (!r) return fallback;

  const name = str(find(r, 'ModuleName')) || filename.replace(/\.(xml|zip)$/i, '') || 'Unknown Module';
  const moduleCode = str(find(r, 'ModuleCode')) || '';
  const prefix = str(find(r, 'IdentifierPrefix')) || '';
  const category = str(find(r, 'Category')) || '';
  const version = str(find(r, 'VersionNumber')) || '';
  const workflowFlag = str(find(r, 'HasWorkflowFlag')) === 'Y';
  const publicFlag = false; // Not exposed in module export XML

  let moduleType;
  if (publicFlag && workflowFlag) moduleType = 'Public, Workflow-Enabled';
  else if (publicFlag) moduleType = 'Public, Non-Workflow';
  else if (workflowFlag) moduleType = 'Non-Public, Workflow-Enabled';
  else moduleType = 'Non-Public, Non-Workflow';

  return { name, moduleCode, prefix, category, moduleType, publicFlag, workflowFlag, version, description: '' };
}

function extractLevels(r) {
  if (!r) return [];
  const levelEls = children(r, 'ScreenLayoutLevel');

  const seen = new Set();
  return levelEls.map(el => {
    const code = str(find(el, 'ScreenLayoutLevelSubCode')) || '';
    const name = str(find(el, 'ScreenLayoutLevelName')) || '';
    const fieldLevelCode = str(find(el, 'FieldLevelCode')) || '';
    if (!code || seen.has(code)) return null;
    seen.add(code);
    return {
      code,
      name,
      fieldLevelCode,
      isHeader: fieldLevelCode === 'H' || code === 'H',
      order: parseInt(str(find(el, 'DisplayOrder')) || '0') || 0,
    };
  }).filter(Boolean).sort((a, b) => {
    if (a.isHeader) return -1;
    if (b.isHeader) return 1;
    return a.order - b.order;
  });
}

function extractFields(r) {
  if (!r) return [];
  const levelEls = children(r, 'ScreenLayoutLevel');
  const allFields = [];

  for (const levelEl of levelEls) {
    const levelCode = str(find(levelEl, 'ScreenLayoutLevelSubCode')) || 'H';
    const levelName = str(find(levelEl, 'ScreenLayoutLevelName')) || '';
    const fieldLevelCode = str(find(levelEl, 'FieldLevelCode')) || 'H';
    const screenLayouts = children(levelEl, 'ScreenLayout');

    for (const sl of screenLayouts) {
      if (str(find(sl, 'LayoutType')) !== 'F') continue;

      const fieldType = str(find(sl, 'FieldType')) || '';
      const fieldCode = str(find(sl, 'FieldCode')) || '';
      if (!fieldCode) continue;

      // Picklist values from SubscriberSmartCodes
      const smartCodes = children(sl, 'SubscriberSmartCodes');
      const picklist = smartCodes.map(sc => ({
        value: str(find(sc, 'Code')) || '',
        label: str(find(sc, 'Meaning')) || '',
        order: parseInt(str(find(sc, 'DisplayOrder')) || '0') || 0,
      })).sort((a, b) => a.order - b.order);

      // Help text from ObjectHelp child
      const helpEls = children(sl, 'ObjectHelp');
      const helpText = helpEls.length > 0 ? str(find(helpEls[0], 'HelpText')) : '';

      allFields.push({
        code: fieldCode,
        subCode: str(find(sl, 'FieldSubCode')) || '',
        type: fieldType,
        typeFull: typeName(fieldType),
        prompt: str(find(sl, 'FieldPrompt')) || '',
        name: str(find(sl, 'Name')) || '',
        level: levelCode,
        levelName,
        isHeader: fieldLevelCode === 'H',
        order: parseInt(str(find(sl, 'DisplayOrder')) || '0') || 0,
        searchIndexed: str(find(sl, 'IncldInSrchIndxFlg')) === 'Y',
        searchable: str(find(sl, 'SearchableFlag')) === 'Y',
        trackHistory: str(find(sl, 'TrackHistoryFlag')) === 'Y',
        calculated: str(find(sl, 'CalculatedFieldFlag')) === 'Y',
        identifying: str(find(sl, 'IncludeInDetailsStringFlag')) === 'Y',
        refreshOnChange: str(find(sl, 'RefreshOnChangeFlag')) === 'Y',
        helpText,
        region: str(find(sl, 'FieldRegionCode')) || '',
        height: str(find(sl, 'FieldHeight')) || '',
        width: str(find(sl, 'FieldWidth')) || '',
        printRegion: str(find(sl, 'PrintRegion')) || '',
        picklist,
        // Kept for pdfGenerator compatibility (populated via rules)
        behaviors: [],
        calculation: '',
        referenceModules: [],
        calculationOrder: '',
        required: false, // Derived from rules in computeStats
        allowOverflow: false,
        hiddenFromRest: false,
        commonField: '',
        displayFormat: '',
        searchBoost: '',
      });
    }
  }

  return allFields;
}

function extractRegions(r) {
  if (!r) return [];
  const levelEls = children(r, 'ScreenLayoutLevel');
  const allRegions = [];

  for (const levelEl of levelEls) {
    const levelCode = str(find(levelEl, 'ScreenLayoutLevelSubCode')) || 'H';
    const screenLayouts = children(levelEl, 'ScreenLayout');

    for (const sl of screenLayouts) {
      if (str(find(sl, 'LayoutType')) !== 'R') continue;

      const fieldCode = str(find(sl, 'FieldCode')) || '';
      if (!fieldCode) continue;

      allRegions.push({
        code: fieldCode,
        name: str(find(sl, 'FieldPrompt')) || '',
        style: str(find(sl, 'DisplayStyle')) || '',
        order: parseInt(str(find(sl, 'DisplayOrder')) || '0') || 0,
        level: levelCode,
        parentRegion: str(find(sl, 'ParentRegionCode')) || str(find(sl, 'FieldRegionCode')) || '',
        fields: [], // Fields reference regions by FieldRegionCode
        tab: '',
      });
    }
  }

  return allRegions.sort((a, b) => a.order - b.order);
}

function extractWorkflow(r) {
  if (!r) return { segments: [], tasks: [], enabled: false, reopenEnabled: false, rollbackEnabled: false };
  const wfEls = children(r, 'ModuleWorkflow');
  if (wfEls.length === 0) return { segments: [], tasks: [], enabled: true, reopenEnabled: false, rollbackEnabled: false };
  const wf = wfEls[0];

  const segmentEls = children(wf, 'ModuleWorkflowSegment');
  const segments = segmentEls.map(seg => {
    const eventEls = children(seg, 'ModuleWorkflowEvent');
    const events = eventEls.map(ev => ({
      code: str(find(ev, 'ModuleWorkflowEventCode')) || '',
      name: str(find(ev, 'WorkflowEventName')) || '',
      stepOrder: parseInt(str(find(ev, 'StepOrder')) || '0') || 0,
      allowRollback: str(find(ev, 'AllowRollBack')) === 'Y',
      allowCancel: str(find(ev, 'AllowCancel')) === 'Y',
      allowRollForward: str(find(ev, 'AllowRollForward')) === 'Y',
      allowSubTasks: str(find(ev, 'AllowSubTasks')) === 'Y',
      assignmentType: str(find(ev, 'AssigmentType')) || '',
    })).sort((a, b) => a.stepOrder - b.stepOrder);

    return {
      code: str(find(seg, 'ModuleWorkflowSegmentCode')) || '',
      name: str(find(seg, 'WorkflowSegmentName')) || '',
      stepOrder: parseInt(str(find(seg, 'StepOrder')) || '0') || 0,
      taskOrder: str(find(seg, 'TaskOrderCode')) || 'S',
      events,
    };
  }).sort((a, b) => a.stepOrder - b.stepOrder);

  // Flat tasks list for backward-compat (overview, stats)
  const tasks = segments.flatMap(s =>
    s.events.length > 0
      ? s.events.map(ev => ({ code: ev.code, name: ev.name, order: ev.stepOrder, assignments: [], rules: [], description: '', skipCondition: '', completionRule: '' }))
      : [{ code: s.code, name: s.name, order: s.stepOrder, assignments: [], rules: [], description: '', skipCondition: '', completionRule: '' }]
  );

  return { segments, tasks, enabled: true, reopenEnabled: false, rollbackEnabled: false };
}

function extractRules(r) {
  if (!r) return [];
  const ruleEls = children(r, 'ModuleRule');

  return ruleEls.map(el => {
    const nameEls = children(el, 'ModuleRuleName');
    const ruleName = nameEls.length > 0 ? str(find(nameEls[0], 'Name')) : '';

    const targetEls = children(el, 'ModuleRuleTarget');
    const targets = targetEls.map(t => ({
      targetType: str(find(t, 'TargetType')) || '',
      targetTypeName: targetTypeName(str(find(t, 'TargetType')) || ''),
      targetCode: str(find(t, 'TargetCode')) || '',
      targetLogic: str(find(t, 'TargetUserLogic')) || '',
      subType: str(find(t, 'SubType')) || '',
    }));

    return {
      code: str(find(el, 'ModuleRuleCode')) || '',
      ruleType: str(find(el, 'RuleType')) || '',
      name: ruleName,
      condition: str(find(el, 'RuleUserLogic')) || '',
      sortOrder: parseInt(str(find(el, 'SortOrder')) || '0') || 0,
      targets,
      // Backward-compat fields
      target: targets[0]?.targetCode || '',
      behavior: targets[0]?.targetTypeName || '',
      value: targets[0]?.targetLogic || '',
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}

function extractRoles(r) {
  if (!r) return [];
  const roleEls = children(r, 'ModuleRole');

  return roleEls.map(el => ({
    code: str(find(el, 'ModuleRoleCode')) || '',
    name: str(find(el, 'ModuleRoleName')) || '',
    canEdit: str(find(el, 'EditObjectsFlag')) === 'Y',
    canDelete: str(find(el, 'DeleteObjectsFlag')) === 'Y',
    isSuperuser: str(find(el, 'SuperuserFlag')) === 'Y',
    allowSearch: str(find(el, 'AllowSearchFlag')) === 'Y',
    allowSearchAll: str(find(el, 'AllwSrchFrAllObjctsFlag')) === 'Y',
    allowInitiate: str(find(el, 'AllowInitiateItemsFlag')) === 'Y',
    allowInitiateRef: str(find(el, 'AllowInitiateRefItemsFlag')) === 'Y',
    allowAlternateAccess: str(find(el, 'AllowAlternateAccessFlag')) === 'Y',
    // Kept for pdfGenerator compatibility
    description: '',
    isWorkflowRole: false,
    permissions: [],
  }));
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

  data.levels.forEach(l => levelSet.add(l.code));

  // Required fields: those targeted by at least one RQ rule
  const requiredFieldCodes = new Set(
    data.rules.flatMap(r => r.targets.filter(t => t.targetType === 'RQ').map(t => t.targetCode))
  );

  return {
    totalFields: data.fields.length,
    fieldsByType,
    fieldsByLevel,
    totalLevels: levelSet.size || data.levels.length,
    totalWorkflowTasks: data.workflow.tasks.length,
    totalWorkflowSegments: data.workflow.segments.length,
    totalRules: data.rules.length,
    totalRoles: data.roles.length,
    totalRegions: data.regions.length,
    totalFunctions: 0,
    identifyingFields: data.fields.filter(f => f.identifying).length,
    searchIndexedFields: data.fields.filter(f => f.searchIndexed).length,
    trackedFields: data.fields.filter(f => f.trackHistory).length,
    requiredFields: requiredFieldCodes.size,
    calculatedFields: data.fields.filter(f => f.calculated || f.type.startsWith('V')).length,
    referenceFields: data.fields.filter(f => f.type === 'R').length,
  };
}

module.exports = { parseModuleFile };
