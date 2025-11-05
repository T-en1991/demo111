import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      quitApp(): void
      fish: {
        findAll(): Promise<any[]>
        findById(id: number): Promise<any | null>
        search(query: { name?: string; type?: string; status?: 'running' | 'stopped' }): Promise<any[]>
        create(data: { name: string; type: string; status?: 'running' | 'stopped' }): Promise<any>
        update(id: number, data: { name?: string; type?: string; status?: 'running' | 'stopped' }): Promise<any>
        delete(id: number): Promise<any>
        deleteMany(ids: number[]): Promise<any>
      }
    }
  }
}
