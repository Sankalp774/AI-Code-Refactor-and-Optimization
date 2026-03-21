import { api } from '@/api/client'
import type { AnalysisResponse, RefactoredResponse } from '@/types/api'

function fileToFormData(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

export async function analyzeFile(file: File): Promise<AnalysisResponse> {
  const { data } = await api.post<AnalysisResponse>('/api/analyze', fileToFormData(file), {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export async function refactorFile(file: File): Promise<RefactoredResponse> {
  const { data } = await api.post<RefactoredResponse>('/api/refactor', fileToFormData(file), {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

