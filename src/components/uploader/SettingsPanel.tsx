'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import type { OutputFormat, ProcessingOptions } from '@/types/image'

interface SettingsPanelProps {
  options: ProcessingOptions
  onChange: (o: ProcessingOptions) => void
  disabled?: boolean
}

const FORMATS: OutputFormat[] = ['jpeg', 'webp', 'png']
const FORMAT_LABEL: Record<OutputFormat, string> = { jpeg: 'JPEG', webp: 'WebP', png: 'PNG' }

export function SettingsPanel({ options, onChange, disabled }: SettingsPanelProps) {
  const set = (patch: Partial<ProcessingOptions>) => onChange({ ...options, ...patch })

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-zinc-300">처리 설정</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs text-zinc-400">최대 크기</span>
            <span className="text-xs text-white">{options.maxWidthOrHeight}px</span>
          </div>
          <Slider
            min={256}
            max={4096}
            step={128}
            value={[options.maxWidthOrHeight]}
            onValueChange={(v) => set({ maxWidthOrHeight: (v as number[])[0] })}
            disabled={disabled}
          />
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs text-zinc-400">품질</span>
            <span className="text-xs text-white">{Math.round(options.quality * 100)}%</span>
          </div>
          <Slider
            min={0.1}
            max={1}
            step={0.05}
            value={[options.quality]}
            onValueChange={(v) => set({ quality: (v as number[])[0] })}
            disabled={disabled}
          />
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs text-zinc-400">동시 처리</span>
            <span className="text-xs text-white">{options.concurrency}개</span>
          </div>
          <Slider
            min={1}
            max={8}
            step={1}
            value={[options.concurrency]}
            onValueChange={(v) => set({ concurrency: (v as number[])[0] })}
            disabled={disabled}
          />
        </div>

        <div>
          <p className="text-xs text-zinc-400 mb-2">출력 포맷</p>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => set({ outputFormat: f })}
                disabled={disabled}
                className="px-0 py-0 bg-transparent border-none"
              >
                <Badge
                  variant={options.outputFormat === f ? 'default' : 'secondary'}
                  className="cursor-pointer"
                >
                  {FORMAT_LABEL[f]}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
