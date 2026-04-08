jest.mock('../../fileHandlers', () => ({
  __esModule: true,
  upload: jest.fn(),
}));

import {
  COMMAND_UPLOAD,
  COMMAND_UPLOAD_ACTIVEFILE_TO_ALL_PROFILES,
  COMMAND_UPLOAD_FILE_TO_ALL_PROFILES,
  COMMAND_UPLOAD_FOLDER_TO_ALL_PROFILES,
  COMMAND_FORCE_UPLOAD_TO_ALL_PROFILES,
  COMMAND_UPLOAD_PROJECT_TO_ALL_PROFILES,
  COMMAND_UPLOAD_TO_ALL_PROFILES,
} from '../../constants';
import fileCommandUpload from '../fileCommandUpload';
import fileMultiCommandUploadActiveFileToAllProfiles from '../fileMultiCommandUploadActiveFileToAllProfiles';
import fileMultiCommandUploadFileToAllProfiles from '../fileMultiCommandUploadFileToAllProfiles';
import fileMultiCommandUploadFolderToAllProfiles from '../fileMultiCommandUploadFolderToAllProfiles';
import fileMultiCommandUploadForceToAllProfiles from '../fileMultiCommandUploadForceToAllProfiles';
import fileMultiCommandUploadProjectToAllProfiles from '../fileMultiCommandUploadProjectToAllProfiles';
import fileMultiCommandUploadToAllProfiles from '../fileMultiCommandUploadToAllProfiles';

describe('upload command wrappers', () => {
  test('export the expected command ids and preserve wrapped behavior', () => {
    expect(fileCommandUpload.id).toBe(COMMAND_UPLOAD);

    expect(fileMultiCommandUploadActiveFileToAllProfiles.id).toBe(
      COMMAND_UPLOAD_ACTIVEFILE_TO_ALL_PROFILES
    );
    expect(fileMultiCommandUploadFileToAllProfiles.id).toBe(
      COMMAND_UPLOAD_FILE_TO_ALL_PROFILES
    );
    expect(fileMultiCommandUploadFolderToAllProfiles.id).toBe(
      COMMAND_UPLOAD_FOLDER_TO_ALL_PROFILES
    );
    expect(fileMultiCommandUploadForceToAllProfiles.id).toBe(
      COMMAND_FORCE_UPLOAD_TO_ALL_PROFILES
    );
    expect(fileMultiCommandUploadProjectToAllProfiles.id).toBe(
      COMMAND_UPLOAD_PROJECT_TO_ALL_PROFILES
    );
    expect(fileMultiCommandUploadToAllProfiles.id).toBe(
      COMMAND_UPLOAD_TO_ALL_PROFILES
    );

    expect(fileMultiCommandUploadToAllProfiles.handleFile).toBe(
      fileCommandUpload.handleFile
    );
    expect(fileMultiCommandUploadToAllProfiles.getFileTarget).toBe(
      fileCommandUpload.getFileTarget
    );
  });
});
