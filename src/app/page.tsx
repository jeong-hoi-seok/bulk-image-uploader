'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropZone } from '@/components/uploader/DropZone'
import { FileCard } from '@/components/uploader/FileCard'
import { SettingsPanel } from '@/components/uploader/SettingsPanel'
import { MetricsDashboard } from '@/components/uploader/MetricsDashboard'
import { DriveUploader } from '@/components/uploader/DriveUploader'
import { useBulkProcessor } from '@/hooks/useBulkProcessor'

export default function Home() {
  const {
    files,
    options,
    session,
    memoryHistory,
    isRunning,
    addFiles,
    cancel,
    cancelAll,
    download,
    startProcessing,
    clearAll,
    setOptions,
  } = useBulkProcessor()

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const hasFiles = files.length > 0

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Bulk Image Processor</h1>
          <p className="text-zinc-500 text-sm mt-1">
            클라이언트사이드 압축 · 리사이징 · 포맷변환 부하 테스트
          </p>
        </div>

        <Tabs defaultValue="local" className="w-full">
          <TabsList className="bg-zinc-900 mb-6">
            <TabsTrigger value="local" className="text-zinc-400 data-[state=active]:text-white data-[state=inactive]:text-zinc-400">
              로컬 처리
            </TabsTrigger>
            <TabsTrigger value="drive" className="text-zinc-400 data-[state=active]:text-white data-[state=inactive]:text-zinc-400">
              Google Drive 업로드
            </TabsTrigger>
          </TabsList>

          <TabsContent value="local">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div className="space-y-4">
                <DropZone onFiles={addFiles} disabled={isRunning} />

                {hasFiles && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">
                      {files.length}개 파일 · 대기 {pendingCount}개
                    </span>
                    <div className="flex gap-2">
                      {isRunning ? (
                        <button
                          onClick={cancelAll}
                          className="px-3 py-1.5 text-xs rounded-md bg-red-900 hover:bg-red-800 text-red-200 transition-colors"
                        >
                          전체 취소
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={clearAll}
                            className="px-3 py-1.5 text-xs rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                          >
                            초기화
                          </button>
                          {pendingCount > 0 && (
                            <button
                              onClick={startProcessing}
                              className="px-3 py-1.5 text-xs rounded-md bg-white hover:bg-zinc-200 text-black font-medium transition-colors"
                            >
                              처리 시작 ({pendingCount}개)
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {files.map((f) => (
                    <FileCard key={f.id} file={f} onCancel={cancel} onDownload={download} />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Tabs defaultValue="settings">
                  <TabsList className="w-full bg-zinc-900">
                    <TabsTrigger value="settings" className="flex-1 text-xs text-zinc-400 data-[state=active]:text-white data-[state=inactive]:text-zinc-400">설정</TabsTrigger>
                    <TabsTrigger value="metrics" className="flex-1 text-xs text-zinc-400 data-[state=active]:text-white data-[state=inactive]:text-zinc-400">부하 측정</TabsTrigger>
                  </TabsList>

                  <TabsContent value="settings" className="mt-3">
                    <SettingsPanel options={options} onChange={setOptions} disabled={isRunning} />
                  </TabsContent>

                  <TabsContent value="metrics" className="mt-3">
                    <MetricsDashboard session={session} memoryHistory={memoryHistory} />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="drive">
            <div className="max-w-2xl">
              <DriveUploader />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
