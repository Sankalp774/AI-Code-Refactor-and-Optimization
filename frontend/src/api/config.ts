import { api } from '@/api/client'
import type { AppMode } from '@/store/useConfigStore'

export interface ConfigResponse {
  mode: AppMode
  model: string
}

export async function getConfig(): Promise<ConfigResponse> {
  const { data } = await api.get<ConfigResponse>('/api/config')
  return data
}

export async function setConfig(mode: AppMode): Promise<ConfigResponse> {
  const { data } = await api.post<ConfigResponse>('/api/config', { mode })
  return data
}

