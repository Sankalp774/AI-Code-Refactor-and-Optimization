import { create } from 'zustand'

import type { AnalysisResponse, RefactoredResponse } from '@/types/api'

interface FileState {
  file: File | null
  originalCode: string
  analysis: AnalysisResponse | null
  refactor: RefactoredResponse | null
  setFile: (file: File | null) => void
  setOriginalCode: (code: string) => void
  setAnalysis: (analysis: AnalysisResponse | null) => void
  setRefactor: (refactor: RefactoredResponse | null) => void
  resetResults: () => void
}

export const useFileStore = create<FileState>((set) => ({
  file: null,
  originalCode: '',
  analysis: null,
  refactor: null,
  setFile: (file) => set({ file }),
  setOriginalCode: (originalCode) => set({ originalCode }),
  setAnalysis: (analysis) => set({ analysis }),
  setRefactor: (refactor) => set({ refactor }),
  resetResults: () => set({ analysis: null, refactor: null }),
}))

