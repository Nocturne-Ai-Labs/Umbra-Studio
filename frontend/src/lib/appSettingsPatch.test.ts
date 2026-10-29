import {test,expect} from 'bun:test';
import {selectSettingsPatch} from './appSettingsPatch';
test('stale client preference save cannot clear server folder roots',()=>{
 const server={'library.externalRoots':['D:/Synthetic - SSD'],'comfyui.showFilmstrip':true};
 const stale={'library.externalRoots':[],'comfyui.showFilmstrip':false};
 const result={...server,...selectSettingsPatch({'comfyui.showFilmstrip':false},stale)};
 expect(result['library.externalRoots']).toEqual(server['library.externalRoots']);expect(result['comfyui.showFilmstrip']).toBe(false);
});
test('explicit root edit and removal still reach the server',()=>{
 const normalized={'library.externalRoots':[],'theme':'dark'};
 expect(selectSettingsPatch({'library.externalRoots':[]},normalized)).toEqual({'library.externalRoots':[]});
});


test('opening and saving without preference edits sends no stale defaults', () => {
 expect(selectSettingsPatch({}, {'library.externalRoots': [], 'theme': 'dark'})).toEqual({});
});

test('edited values use normalized data without sending unrelated fields', () => {
 expect(selectSettingsPatch({'theme': ' DARK '}, {'theme': 'dark', 'library.externalRoots': []})).toEqual({'theme': 'dark'});
});
