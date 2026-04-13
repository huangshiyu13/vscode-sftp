import * as remoteExplorer from '../index';
import RemoteExplorer from '../explorer';
import { ExplorerItem, ExplorerRoot } from '../treeDataProvider';

describe('modules/remoteExplorer/index', () => {
  test('re-exports RemoteExplorer as default', () => {
    expect(remoteExplorer.default).toBe(RemoteExplorer);
  });

  test('re-exports ExplorerItem and ExplorerRoot', () => {
    expect(remoteExplorer.ExplorerItem).toBe(ExplorerItem);
    expect(remoteExplorer.ExplorerRoot).toBe(ExplorerRoot);
  });
});
