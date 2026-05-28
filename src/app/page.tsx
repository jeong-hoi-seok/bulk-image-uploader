'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropZone } from '@/components/uploader/DropZone'
import { FileCard } from '@/components/uploader/FileCard'
import { SettingsPanel } from '@/components/uploader/SettingsPanel'
import { MetricsDashboard } from '@/components/uploader/MetricsDashboard'
import { useUploadPipeline } from '@/hooks/useUploadPipeline'

export default function Home() {
  const {
    files,
    options,
    session,
    memHistory,
    isRunning,
    addFiles,
    cancel,
    cancelAll,
    clearAll,
    setOptions,
  } = useUploadPipeline()

  const doneCount = files.filter((f) => f.status === 'done').length
  const hasFiles = files.length > 0

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Bulk Image Uploader</h1>
          <p className="text-zinc-500 text-sm mt-1">
            이미지 추가 즉시 순차 업로드 · 서버 변환(sharp) → Google Drive
          </p>
        </div>

        <Tabs defaultValue="upload">
          <TabsList className="bg-zinc-900 mb-6">
            <TabsTrigger
              value="upload"
              className="text-zinc-400 data-[state=active]:text-white data-[state=inactive]:text-zinc-400"
            >
              업로드
              {hasFiles && <span className="ml-1.5 text-zinc-500 text-xs">({files.length})</span>}
            </TabsTrigger>
            <TabsTrigger
              value="metrics"
              className="text-zinc-400 data-[state=active]:text-white data-[state=inactive]:text-zinc-400"
            >
              부하 측정
              {doneCount > 0 && <span className="ml-1.5 text-emerald-500 text-xs">({doneCount})</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
              <div className="space-y-4">
                <DropZone onFiles={addFiles} disabled={false} />

                {hasFiles && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">
                      {files.length}개
                      {isRunning && <span className="ml-2 text-zinc-500">업로드 중...</span>}
                    </span>
                    <div className="flex gap-2">
                      {isRunning && (
                        <button
                          onClick={cancelAll}
                          className="px-3 py-1.5 text-xs rounded-md bg-red-900 hover:bg-red-800 text-red-200 transition-colors"
                        >
                          전체 취소
                        </button>
                      )}
                      <button
                        onClick={clearAll}
                        className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                      >
                        초기화
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {files.map((f) => (
                    <FileCard key={f.id} file={f} onCancel={cancel} />
                  ))}
                </div>
              </div>

              <div>
                <SettingsPanel options={options} onChange={setOptions} disabled={isRunning} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="metrics">
            <MetricsDashboard session={session} memHistory={memHistory} files={files} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
