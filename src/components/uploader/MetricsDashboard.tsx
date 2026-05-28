'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { formatBytes } from '@/lib/imageProcessor'
import type { MemorySnapshot, SessionMetrics } from '@/types/image'

interface MetricsDashboardProps {
  session: SessionMetrics
  memoryHistory: MemorySnapshot[]
}

export function MetricsDashboard({ session, memoryHistory }: MetricsDashboardProps) {
  const ratio =
    session.totalOriginalSize > 0
      ? (1 - session.totalProcessedSize / session.totalOriginalSize) * 100
      : 0

  const chartData = memoryHistory.map((s, i) => ({
    t: i,
    mb: parseFloat(s.usedMB.toFixed(1)),
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="처리 완료" value={`${session.processedFiles} / ${session.totalFiles}`} />
        <StatCard label="실패" value={String(session.failedFiles)} accent="red" />
        <StatCard label="절약 용량" value={formatBytes(session.totalOriginalSize - session.totalProcessedSize)} accent="emerald" />
        <StatCard label="압축률" value={`${ratio.toFixed(1)}%`} accent="emerald" />
        <StatCard label="평균 압축 시간" value={`${session.avgCompressTime.toFixed(0)}ms`} />
        <StatCard label="최대 메모리" value={`${session.peakMemoryMB.toFixed(1)} MB`} />
      </div>

      {chartData.length > 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-zinc-400">메모리 사용량 (MB)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="t" hide />
                <YAxis width={32} tick={{ fontSize: 10, fill: '#71717a' }} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', fontSize: 11 }}
                  labelFormatter={() => ''}
                  formatter={(v) => [`${v} MB`, 'Used']}
                />
                <Line
                  type="monotone"
                  dataKey="mb"
                  stroke="#34d399"
                  dot={false}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'red' }) {
  const color = accent === 'emerald' ? 'text-emerald-400' : accent === 'red' ? 'text-red-400' : 'text-white'
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-3">
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <p className={`text-lg font-semibold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
