'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts'
import { formatBytes } from '@/lib/imageProcessor'
import type { MemorySnapshot, SessionMetrics, UploadFile } from '@/types/image'

interface MetricsDashboardProps {
  session: SessionMetrics
  memHistory: MemorySnapshot[]
  files: UploadFile[]
}

export function MetricsDashboard({ session, memHistory, files }: MetricsDashboardProps) {
  const done = files.filter((f) => f.status === 'done' && f.serverMetrics)
  const ratio =
    session.totalOriginalSize > 0
      ? (1 - session.totalResizedSize / session.totalOriginalSize) * 100
      : 0

  const sizeData = done.map((f) => ({
    name: f.file.name.replace(/\.[^.]+$/, '').slice(0, 12),
    원본: parseFloat((f.serverMetrics!.originalSize / 1024).toFixed(1)),
    압축: parseFloat((f.serverMetrics!.resizedSize / 1024).toFixed(1)),
  }))

  const timeData = done.map((f) => ({
    name: f.file.name.replace(/\.[^.]+$/, '').slice(0, 12),
    리사이즈: f.serverMetrics!.resizeMs,
    업로드: f.serverMetrics!.uploadMs,
  }))

  const tooltipStyle = {
    contentStyle: { background: '#18181b', border: '1px solid #27272a', fontSize: 11 },
    labelStyle: { color: '#a1a1aa' },
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="처리 완료" value={`${session.processedFiles} / ${session.totalFiles}`} />
        <Stat label="실패" value={String(session.failedFiles)} accent="red" />
        <Stat label="압축률 (평균)" value={`${ratio.toFixed(1)}%`} accent="emerald" />
        <Stat label="절약 용량" value={formatBytes(session.totalOriginalSize - session.totalResizedSize)} accent="emerald" />
        <Stat label="평균 리사이즈" value={`${session.avgResizeMs.toFixed(0)}ms`} />
        <Stat label="평균 업로드" value={`${session.avgUploadMs.toFixed(0)}ms`} />
        <Stat label="최대 메모리 (근사치)" value={session.peakMemoryMB > 0 ? `~${session.peakMemoryMB.toFixed(0)} MB` : '-'} />
        <Stat label="총 소요시간" value={`${(session.elapsedMs / 1000).toFixed(1)}s`} />
      </div>

      {sizeData.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">파일 크기 비교 (KB)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sizeData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={40} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} KB`]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
                <Bar dataKey="원본" fill="#52525b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="압축" fill="#34d399" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {timeData.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">처리 시간 (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={timeData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={40} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} ms`]} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a1aa' }} />
                <Bar dataKey="리사이즈" fill="#818cf8" radius={[2, 2, 0, 0]} />
                <Bar dataKey="업로드" fill="#38bdf8" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {memHistory.length > 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">
              JS 힙 메모리 추이 (MB)
              <span className="ml-1.5 text-zinc-600 font-normal">· Chrome 전용 · 근사치</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={memHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="t" hide />
                <YAxis tick={{ fontSize: 10, fill: '#71717a' }} width={36} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`~${v} MB`, 'JS 힙']} labelFormatter={() => ''} />
                <Line type="monotone" dataKey="mb" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'red' }) {
  const color = accent === 'emerald' ? 'text-emerald-400' : accent === 'red' ? 'text-red-400' : 'text-white'
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-3">
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <p className={`text-base font-semibold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
