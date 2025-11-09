import { ElectronAPI } from '@electron-toolkit/preload'
type Prisma = import('@prisma/client').Prisma
type Fish = import('@prisma/client').Fish

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      quitApp(): void
      fish: {
        findAll(): Promise<Fish[]>
        findById(id: number): Promise<Fish | null>
        search(query: { name?: string; type?: string; status?: 'running' | 'stopped' }): Promise<Fish[]>
        create(data: { name: string; type: string; status?: 'running' | 'stopped'; ip?: string | null; port?: number | null }): Promise<Fish>
        update(id: number, data: { name?: string; type?: string; status?: 'running' | 'stopped'; ip?: string | null; port?: number | null }): Promise<Fish>
        delete(id: number): Promise<Fish>
        deleteMany(ids: number[]): Promise<Prisma.BatchPayload>
        seed(count: number): Promise<Prisma.BatchPayload>
      }
    }
  }
}
