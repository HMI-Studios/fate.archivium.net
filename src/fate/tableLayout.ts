import type { TabLayout } from '../layout/core';

// The campaign's Table Notes item (see fate/table.ts) as an Archivium tab type, so its
// journal can be read and edited in Archivium too. No item type lists it: Archivium
// shows a tab type on any item that has data for it, so only the Table Notes item gets
// the tab. Data is stored as obj_data.layoutTabs['fate-table'].

export const FATE_TABLE_LAYOUT_ID = 'fate-table';

export const FATE_TABLE_LAYOUT: TabLayout = {
  version: 1,
  id: FATE_TABLE_LAYOUT_ID,
  title: 'Journal',
  rows: [
    {
      sections: [
        {
          title: 'Journal',
          fields: [{ widget: 'text', path: 'journal', label: 'Journal', multiline: true, rows: 20 }],
        },
      ],
    },
  ],
};
