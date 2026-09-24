import type { SheetLayout } from '../layout/core';

// A scene (a map/location item) as a declarative layout, so scenes can be prepared
// and read in Archivium: an Archivium tab type. Data is stored on the scene's item as
// obj_data.layoutTabs['fate-scene'].
//
// `aspects` is also what the game room's aspects panel reads and writes. Layout list
// fields are text only, so entries carry extra keys the sheet doesn't show (kind,
// target, id); see fate/aspects.ts. Entries written in Archivium without them are
// situation aspects on the scene.

export const FATE_SCENE_LAYOUT_ID = 'fate-scene';

export const FATE_SCENE_LAYOUT: SheetLayout = {
  version: 1,
  id: FATE_SCENE_LAYOUT_ID,
  title: 'Scene',
  rows: [
    {
      sections: [
        {
          title: 'Scene',
          basis: '20rem',
          fields: [
            { widget: 'title', caption: 'Name' },
            { widget: 'text', path: 'description', caption: 'Description', multiline: true },
          ],
        },
        { title: 'Issues', fields: [{ widget: 'textList', path: 'issues', label: 'Issue', count: 2 }] },
      ],
    },
    {
      sections: [
        {
          title: 'Aspects',
          fields: [{
            widget: 'entryList',
            path: 'aspects',
            itemLabel: 'Aspect',
            addLabel: 'Add Aspect',
            fields: [
              { key: 'name', placeholder: 'Aspect' },
              { key: 'invokes', placeholder: 'Free invokes' },
              { key: 'note', placeholder: 'Notes' },
            ],
          }],
        },
      ],
    },
    {
      sections: [
        { title: 'Notes', fields: [{ widget: 'text', path: 'notes', label: 'Notes', multiline: true, rows: 6 }] },
      ],
    },
  ],
};
