/// <reference types="vite/client" />

import type { ChujuanApi } from '../../shared/ipc'

declare global {
  interface Window {
    chujuan: ChujuanApi
  }
}

export {}

