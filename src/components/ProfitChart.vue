<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useTheme } from '@/composables/useTheme'

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  CanvasRenderer,
])

export interface ProfitLine {
  name: string
  /** Token whose colour the line takes, e.g. `accent`. */
  color: 'accent' | 'info'
  /** Running P/L in units, one per day. */
  values: number[]
}

const props = defineProps<{
  /** Axis labels, one per day. */
  days: string[]
  lines: ProfitLine[]
  /** Formats an amount in units for the axis and the tooltip. */
  format: (units: number) => string
  /** Accessible name of the chart. */
  label: string
}>()

const TOKENS = ['accent', 'info', 'muted', 'border', 'text', 'surface'] as const
type Token = (typeof TOKENS)[number]

/** The `--eb-*` colours, read again when the theme switches so the canvas follows dark mode. */
const { theme } = useTheme()
const colors = ref({} as Record<Token, string>)
watch(
  theme,
  () => {
    const style = getComputedStyle(document.documentElement)
    colors.value = Object.fromEntries(
      TOKENS.map((token) => [token, style.getPropertyValue(`--eb-${token}`).trim()]),
    ) as Record<Token, string>
  },
  { immediate: true },
)

const option = computed(() => {
  const c = colors.value
  const format = props.format
  return {
    animation: false,
    textStyle: { fontFamily: 'Inter, sans-serif', color: c.muted },
    grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
    legend: { top: 0, left: 0, icon: 'roundRect', textStyle: { color: c.text } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      valueFormatter: (value: number) => format(value),
    },
    xAxis: {
      type: 'category',
      data: props.days,
      boundaryGap: false,
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
      axisLabel: { color: c.muted },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: (value: number) => format(value) },
      splitLine: { lineStyle: { color: c.border } },
    },
    series: props.lines.map((line, i) => ({
      type: 'line',
      name: line.name,
      data: line.values,
      showSymbol: false,
      lineStyle: { width: 2.5, color: c[line.color] },
      itemStyle: { color: c[line.color] },
      // Dashed zero line, drawn once.
      ...(i === 0 && {
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { type: 'dashed', width: 1, color: c.muted },
          data: [{ yAxis: 0 }],
        },
      }),
    })),
  }
})
</script>

<template>
  <div role="img" :aria-label="label" class="h-72 w-full">
    <VChart :option="option" autoresize />
  </div>
</template>
