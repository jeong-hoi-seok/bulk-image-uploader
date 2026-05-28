'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import type { OutputFormat, ProcessingOptions } from '@/types/image'

interface SettingsPanelProps {
  options: ProcessingOptions
  onChange: (o: ProcessingOptions) => void
  disabled?: boolean
}

const FORMATS: { value: OutputFormat; label: string; desc: string }[] = [
  { value: 'jpeg', label: 'JPEG', desc: '범용, 작은 용량' },
  { value: 'webp', label: 'WebP', desc: '최신, 고압축' },
  { value: 'png', label: 'PNG', desc: '무손실, 큰 용량' },
]

export function SettingsPanel({ options, onChange, disabled }: SettingsPanelProps) {
  const set = (patch: Partial<ProcessingOptions>) => onChange({ ...options, ...patch })

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-zinc-300">처리 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs text-zinc-400 mb-2">출력 포맷</p>
          <div className="flex flex-col gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => set({ outputFormat: f.value })}
                disabled={disabled}
                className={`flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors ${
                  options.outputFormat === f.value
                    ? 'border-white bg-zinc-800 text-white'
                    : 'border-zinc-700 bg-transparent text-zinc-400 hover:border-zinc-500'
                }`}
              >
                <span className="text-xs font-medium">{f.label}</span>
                <span className="text-xs text-zinc-600">{f.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs text-zinc-400">품질</span>
            <span className="text-xs text-white">{options.quality}%</span>
          </div>
          {/* inverted: right=high, left=low → store as-is, display 101-sliderVal */}
          <Slider
            min={1} max={100} step={1}
            value={[101 - options.quality]}
            onValueChange={(v) => {
              const raw = Array.isArray(v) ? v[0] : v
              if (typeof raw === 'number') set({ quality: 101 - raw })
            }}
            disabled={disabled}
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-zinc-600">고품질</span>
            <span className="text-xs text-zinc-600">저품질</span>
          </div>
        </div>

        <div className="pt-1 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">파일 추가 즉시 순차 업로드 · 서버(sharp) 변환 → Drive</p>
        </div>
      </CardContent>
    </Card>
  )
}
