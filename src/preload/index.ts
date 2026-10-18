import { contextBridge, ipcRenderer } from 'electron'
import type { ChujuanApi } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import type { ProgressEvent } from '../shared/schemas'

const api: ChujuanApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  saveSettings: (input) => ipcRenderer.invoke(IPC.settingsSave, input),
  testProvider: (input) => ipcRenderer.invoke(IPC.providerTest, input),
  listChapters: (edition, grade) =>
    ipcRenderer.invoke(IPC.chaptersList, edition, grade),
  preflight: (config) => ipcRenderer.invoke(IPC.paperPreflight, config),
  generatePaper: (config) => ipcRenderer.invoke(IPC.paperGenerate, config),
  cancelGeneration: () => ipcRenderer.invoke(IPC.paperCancel),
  onProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: ProgressEvent): void =>
      callback(value)
    ipcRenderer.on(IPC.paperProgress, listener)
    return () => ipcRenderer.removeListener(IPC.paperProgress, listener)
  },
  savePaper: (paper) => ipcRenderer.invoke(IPC.paperSave, paper),
  regenerateQuestion: (paper, sectionIndex, questionIndex) =>
    ipcRenderer.invoke(IPC.paperRegenerateQuestion, {
      paper,
      sectionIndex,
      questionIndex
    }),
  hardenPaper: (paper, sectionIndex, questionIndex) =>
    ipcRenderer.invoke(IPC.paperHarden, {
      paper,
      sectionIndex,
      questionIndex
    }),
  exportPaper: (paper, formats, includeAnswerSheet) =>
    ipcRenderer.invoke(IPC.paperExport, { paper, formats, includeAnswerSheet }),
  listPapers: () => ipcRenderer.invoke(IPC.libraryList),
  listQuestionBank: () => ipcRenderer.invoke(IPC.questionBankList),
  updateQuestionBank: (update) =>
    ipcRenderer.invoke(IPC.questionBankUpdate, update),
  exportQuestionBank: () => ipcRenderer.invoke(IPC.questionBankExport),
  getPaper: (id) => ipcRenderer.invoke(IPC.libraryGet, id),
  deletePaper: (id) => ipcRenderer.invoke(IPC.libraryDelete, id),
  deletePapers: (ids) => ipcRenderer.invoke(IPC.libraryDeleteMany, ids),
  duplicatePaper: (id) => ipcRenderer.invoke(IPC.libraryDuplicate, id),
  openOutputFolder: (targetPath) => ipcRenderer.invoke(IPC.shellOpenPath, targetPath)
}

contextBridge.exposeInMainWorld('chujuan', api)

