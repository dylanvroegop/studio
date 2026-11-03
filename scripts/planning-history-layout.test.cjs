const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { Timestamp } = require('firebase/firestore');

function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Intl,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : require(name),
  });
  return module.exports;
}
const utils = load('src/lib/planning-utils.ts', {
  './types-planning': { DEFAULT_PLANNING_SETTINGS: {} },
});
const colors = load('src/lib/planning-colors.ts');
const dependencies = {
  react: { ...React, useMemo: callback => callback() },
  'lucide-react': { MapPin: 'map-pin', Clock: 'clock', Briefcase: 'briefcase' },
  '@/lib/planning-utils': utils,
  '@/lib/planning-colors': colors,
  '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
  '@/components/ui/tooltip': { Tooltip: 'tooltip', TooltipContent: 'tooltip-content', TooltipProvider: 'tooltip-provider', TooltipTrigger: 'tooltip-trigger' },
};
const { ScheduleBlock } = load('src/components/planning/ScheduleBlock.tsx', dependencies);
const { PlanningGrid } = load('src/components/planning/PlanningGrid.tsx', {
  ...dependencies, './ScheduleBlock': { ScheduleBlock },
  './useDragResize': { useDragResize: () => ({ onDragStart() {}, isDragging: false, suppressClick: false }) },
});

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const date = hour => new Date(2026, 9, 5, ...hour.split(':').map(Number));
function entry(id, start, end, history = false) {
  return {
    id, startDate: Timestamp.fromDate(date(start)), endDate: Timestamp.fromDate(date(end)),
    isGoogleCalendarHistory: history, isAllDay: history, googleCalendarSummary: id,
    scheduledHours: history ? 0 : (date(end) - date(start)) / 3_600_000,
    cache: { clientName: 'Test', projectTitle: id },
  };
}

test('hele-dag historie en overlappende klussen krijgen elk een eigen rij met dezelfde tijdschaal', () => {
  const entries = [entry('8,30', '00:00', '23:59', true), entry('8,30 Test', '00:00', '23:59', true),
    entry('Klus', '07:30', '18:30'), entry('Overleg', '08:00', '09:00')];
  const tree = PlanningGrid({ view: 'day', dateRange: { start: date('00:00'), end: date('23:59') }, entries,
    onEntryClick() {}, onEntryDrop() {}, onEntryResize() {}, onEmptyCellClick() {} });
  const lanes = nodes(tree).filter(node => node.props?.['data-planning-entry-id']);
  assert.deepEqual(lanes.map(node => node.props['data-planning-entry-id']), entries.map(item => item.id));
  for (const lane of lanes) {
    assert.match(lane.props.className, /relative h-10/);
    const blockNode = lane.props.children;
    assert.equal(blockNode.type, ScheduleBlock);
    const rendered = ScheduleBlock(blockNode.props);
    const block = nodes(rendered).find(node => node.props?.onPointerDown && node.props?.style?.position === 'absolute');
    assert.ok(block, 'Elk blok blijft absoluut ten opzichte van zijn eigen rij.');
    assert.equal(block.props.style.top, '0');
    assert.equal(block.props.style.bottom, '0');
    const actual = blockNode.props.entry;
    if (actual.isAllDay) {
      assert.equal(block.props.style.left, '0%');
      assert.equal(block.props.style.width, '100%');
    } else if (actual.id === 'Klus') {
      assert.equal(block.props.style.left, '10%');
      assert.ok(Math.abs(parseFloat(block.props.style.width) - 11 / 15 * 100) < 0.0001);
    } else {
      assert.ok(Math.abs(parseFloat(block.props.style.left) - 2 / 15 * 100) < 0.0001);
      assert.ok(Math.abs(parseFloat(block.props.style.width) - 1 / 15 * 100) < 0.0001);
    }
  }
});

test('historie houdt Google-duur en start geen drag of resize; gewone planning blijft versleepbaar', () => {
  for (const history of [true, false]) {
    const calls = [];
    const item = { ...entry('Test', '08:00', '09:00', history), googleCalendarSummary: undefined };
    const tree = ScheduleBlock({ entry: item, view: 'day', day: date('00:00'), pauseMinutes: 60,
      onClick() {}, onDragStart: (...args) => calls.push(args) });
    const block = nodes(tree).find(node => node.props?.onPointerDown && node.props?.style?.position === 'absolute');
    block.props.onPointerDown({ preventDefault() {}, stopPropagation() {} });
    assert.equal(calls.length, history ? 0 : 1);
    const resizeHandles = nodes(tree).filter(node => /cursor-[we]-resize/.test(node.props?.className || ''));
    assert.equal(resizeHandles.length, history ? 0 : 2);
    assert.ok(Math.abs(parseFloat(block.props.style.width) - (history ? 1 : 2) / 15 * 100) < 0.0001);
  }
});

test('gewone Google-afspraken en klussen behouden hun eindtijd ondanks lokale pauze-instelling', () => {
  for (const [name, start, end] of [
    ['Gemeente', '14:30', '15:30'], ['Massage', '17:00', '18:00'],
    ['Werkbespreking', '19:00', '20:00'], ['Klus', '07:30', '18:30'],
  ]) {
    for (const marker of [{ googleCalendarEventId: 'google-event', googleCalendarSummary: undefined }, { googleCalendarSummary: name }]) {
      const item = { ...entry(name, start, end), ...marker };
      const tree = ScheduleBlock({ entry: item, view: 'day', day: date('00:00'), pauseMinutes: 60,
        onClick() {}, onDragStart() {} });
      const block = nodes(tree).find(node => node.props?.onPointerDown && node.props?.style?.position === 'absolute');
      const expectedPosition = utils.calculateDayBlockPosition(date(start), date(end), date('00:00'));
      assert.ok(Math.abs(parseFloat(block.props.style.width) - expectedPosition.width) < 0.0001, name);
      assert.ok(nodes(block).some(node => node.props?.children === `${start} - ${end}`), name);
    }
  }
});

test('maandraster haalt alle 42 zichtbare dagen op inclusief de volledige laatste zondag', () => {
  for (const [month, expectedEndMonth, expectedEndDay] of [[6, 7, 9], [7, 8, 6]]) {
    const range = utils.getDateRangeForView('week', new Date(2026, month, 15));
    assert.equal(range.end.getFullYear(), 2026);
    assert.equal(range.end.getMonth(), expectedEndMonth);
    assert.equal(range.end.getDate(), expectedEndDay);
    assert.equal(range.end.getHours(), 23);
    assert.equal(range.end.getMinutes(), 59);
    assert.equal(range.end.getSeconds(), 59);
    assert.equal(range.end.getMilliseconds(), 999);
    assert.equal(utils.getDaysInRange(range.start, range.end).length, 42);
  }
});
